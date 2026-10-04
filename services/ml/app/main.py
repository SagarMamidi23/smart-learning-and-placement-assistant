import os
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel, Field, create_model

from app.embeddings import MAX_CHARS, MAX_TEXTS, Embedder, FastEmbedder
from app.features import FEATURE_SPECS
from app.predictor import Predictor

app = FastAPI(title="SLP ML Service", version="0.3.0")
_started = time.time()
REQUESTS = Counter("ml_requests_total", "Requests handled by the ML service", ["path"])
EMBED_TEXTS = Counter("ml_embed_texts_total", "Texts embedded")
EMBED_SECONDS = Histogram("ml_embed_seconds", "Time to embed one request")
PREDICTIONS = Counter("ml_predictions_total", "Readiness predictions served", ["model_version"])
PREDICTED_SCORE = Histogram(
    "ml_readiness_score",
    "Distribution of predicted readiness scores",
    buckets=list(range(0, 101, 10)),
)

# Replaced in tests so they never download a model.
app.state.embedder = FastEmbedder()
MODEL_PATH = Path(os.environ.get("MODEL_PATH", "models/readiness.joblib"))
app.state.predictor = Predictor.load(MODEL_PATH) if MODEL_PATH.exists() else None


def get_embedder() -> Embedder:
    return app.state.embedder


@app.get("/health")
def health() -> dict:
    REQUESTS.labels(path="/health").inc()
    return {
        "status": "ok",
        "service": "ml",
        "uptime": time.time() - _started,
        "model_loaded": app.state.predictor is not None,
    }


# ---- embeddings ----


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=MAX_TEXTS)


class EmbedResponse(BaseModel):
    model: str
    dim: int
    embeddings: list[list[float]]


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    REQUESTS.labels(path="/embed").inc()
    if any(not t.strip() for t in req.texts):
        raise HTTPException(status_code=422, detail="texts must not be empty")
    if any(len(t) > MAX_CHARS for t in req.texts):
        raise HTTPException(
            status_code=422, detail=f"each text must be at most {MAX_CHARS} characters"
        )
    embedder = get_embedder()
    with EMBED_SECONDS.time():
        vectors = embedder.embed(req.texts)
    EMBED_TEXTS.inc(len(req.texts))
    return EmbedResponse(model=embedder.model, dim=len(vectors[0]), embeddings=vectors)


# ---- readiness ----

# One required, range-checked field per feature, built from the shared feature definitions.
PredictRequest = create_model(
    "PredictRequest",
    **{name: (float, Field(ge=lo, le=hi)) for name, (_, lo, hi) in FEATURE_SPECS.items()},
)


class Factor(BaseModel):
    feature: str
    label: str
    value: float
    typical: float
    impact: float
    direction: str


class PredictResponse(BaseModel):
    score: float
    model_version: str
    top_factors: list[Factor]
    is_fallback: bool = False


def _predictor() -> Predictor:
    p = app.state.predictor
    if p is None:
        raise HTTPException(status_code=503, detail="no trained model is loaded; run train.py")
    return p


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:  # type: ignore[valid-type]
    REQUESTS.labels(path="/predict").inc()
    p = _predictor()
    out = p.predict(req.model_dump())
    PREDICTIONS.labels(model_version=p.version).inc()
    PREDICTED_SCORE.observe(out["score"])
    return PredictResponse(**out)


@app.get("/model")
def model_info() -> dict:
    p = _predictor()
    return {"model_version": p.version, "features": list(FEATURE_SPECS), "metrics": p.metrics}


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
