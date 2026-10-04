"""Text embeddings for the RAG mentor and opportunity matching, from a small local model (no API key)."""

from __future__ import annotations

import os
import threading
from typing import Protocol

MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
MAX_TEXTS = 64
MAX_CHARS = 4000


class Embedder(Protocol):
    model: str
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class FastEmbedder:
    """ONNX model via fastembed: CPU only, no torch. Loaded lazily and shared across requests."""

    def __init__(self, model: str = MODEL_NAME):
        self.model = model
        self.dim = 0
        self._engine = None
        self._lock = threading.Lock()

    def _load(self):
        with self._lock:
            if self._engine is None:
                from fastembed import TextEmbedding

                cache = os.environ.get("FASTEMBED_CACHE_PATH")
                self._engine = TextEmbedding(model_name=self.model, cache_dir=cache)
                self.dim = len(next(iter(self._engine.embed(["warm-up"]))))
        return self._engine

    def embed(self, texts: list[str]) -> list[list[float]]:
        engine = self._load()
        # bge models return unit-length vectors, so cosine similarity is a plain dot product.
        return [[float(x) for x in v] for v in engine.embed(texts)]
