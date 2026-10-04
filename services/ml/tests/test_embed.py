import math
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


class FakeEmbedder:
    """Deterministic bag-of-letters vectors: texts sharing letters are similar. No model download."""

    model = "fake-embedder"
    dim = 26

    def embed(self, texts):
        out = []
        for t in texts:
            v = [0.0] * 26
            for ch in t.lower():
                if "a" <= ch <= "z":
                    v[ord(ch) - 97] += 1
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            out.append([x / n for x in v])
        return out


@pytest.fixture()
def client():
    original = app.state.embedder
    app.state.embedder = FakeEmbedder()
    yield TestClient(app)
    app.state.embedder = original


def test_embed_returns_one_vector_per_text(client):
    res = client.post("/embed", json={"texts": ["thermodynamics", "contract law"]})
    assert res.status_code == 200
    body = res.json()
    assert body["model"] == "fake-embedder"
    assert body["dim"] == 26
    assert len(body["embeddings"]) == 2


def test_embed_rejects_empty_and_oversized_input(client):
    assert client.post("/embed", json={"texts": []}).status_code == 422
    assert client.post("/embed", json={"texts": ["  "]}).status_code == 422
    assert client.post("/embed", json={"texts": ["x" * 4001]}).status_code == 422
    assert client.post("/embed", json={"texts": ["a"] * 65}).status_code == 422


def test_embed_metrics_are_exported(client):
    client.post("/embed", json={"texts": ["hello"]})
    assert "ml_embed_texts_total" in client.get("/metrics").text


@pytest.mark.skipif(
    not os.environ.get("RUN_MODEL_TESTS"), reason="downloads the real model; set RUN_MODEL_TESTS=1"
)
def test_real_model_ranks_related_text_higher():
    from app.embeddings import FastEmbedder

    e = FastEmbedder()
    q, near, far = e.embed(
        [
            "What is the second law of thermodynamics?",
            "Entropy of an isolated system never decreases.",
            "The court dismissed the appeal.",
        ]
    )

    def dot(a, b):
        return sum(x * y for x, y in zip(a, b, strict=True))

    assert dot(q, near) > dot(q, far)
    assert e.dim == 384
