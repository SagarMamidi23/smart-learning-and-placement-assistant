FROM python:3.12-slim AS build
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1
RUN useradd --create-home appuser
WORKDIR /app
COPY --from=build /install /usr/local
ENV FASTEMBED_CACHE_PATH=/opt/models
# Bake the embedding model into the image so the container works offline and starts fast.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/opt/models')" && chmod -R a+rX /opt/models
COPY app app
COPY train.py generate_synthetic_data.py ./
# Train the readiness model at build time (synthetic data, fixed seed, so builds are reproducible). Replace it later
# by mounting a retrained models/ directory; see "Retraining" in the README.
RUN python train.py --out /app/models && chmod -R a+rX /app/models
ENV MODEL_PATH=/app/models/readiness.joblib
USER appuser
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/health')" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]