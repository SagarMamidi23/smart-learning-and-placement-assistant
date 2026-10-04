from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_metrics():
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "ml_requests_total" in res.text
