import json

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import train as trainer
from app.features import FEATURES
from app.main import app
from app.predictor import Predictor
from generate_synthetic_data import generate

GOOD = {
    "assessment_avg": 85,
    "mock_eval_avg": 80,
    "path_completion_pct": 90,
    "skill_gap_coverage_pct": 85,
    "mentor_engagement": 20,
    "days_active": 22,
    "recency_days": 1,
}
WEAK = {
    "assessment_avg": 0,
    "mock_eval_avg": 0,
    "path_completion_pct": 5,
    "skill_gap_coverage_pct": 25,
    "mentor_engagement": 0,
    "days_active": 1,
    "recency_days": 50,
}


@pytest.fixture(scope="module")
def artifact():
    # Small and fast; the full-size run is exercised by `python train.py`.
    return trainer.train(generate(n=1500, seed=7), n_estimators=40)


@pytest.fixture()
def client(artifact):
    original = app.state.predictor
    app.state.predictor = Predictor(artifact)
    yield TestClient(app)
    app.state.predictor = original


class TestSyntheticData:
    def test_shape_ranges_and_balance(self):
        df = generate(n=2000, seed=1)
        assert list(df.columns) == [*FEATURES, "ready"]
        assert len(df) == 2000
        assert df["ready"].isin([0, 1]).all()
        assert 0.35 < df["ready"].mean() < 0.55
        for col, hi in [
            ("assessment_avg", 100),
            ("days_active", 30),
            ("recency_days", 60),
            ("mentor_engagement", 50),
        ]:
            assert df[col].between(0, hi).all()

    def test_is_deterministic_for_a_seed(self):
        pd.testing.assert_frame_equal(generate(n=300, seed=3), generate(n=300, seed=3))
        assert not generate(n=300, seed=3).equals(generate(n=300, seed=4))

    def test_signals_relate_to_the_label_in_the_expected_direction(self):
        corr = generate(n=4000, seed=2).corr()["ready"]
        assert corr["assessment_avg"] > 0.2
        assert corr["days_active"] > 0.2
        assert corr["recency_days"] < -0.05  # a weaker signal than activity itself

    def test_missing_evidence_is_zero(self):
        df = generate(n=3000, seed=5)
        assert (df["assessment_avg"] == 0).mean() > 0.1  # many students have taken no test


class TestTraining:
    def test_compares_both_models_and_reports_all_metrics(self, artifact):
        m = artifact["metrics"]
        assert set(m["candidates"]) == {
            "logistic_regression",
            "random_forest",
            "gradient_boosting_monotone",
        }
        for r in m["candidates"].values():
            assert {"accuracy", "f1", "roc_auc", "brier", "cv_roc_auc_mean"} <= set(r)
            assert 0.5 < r["roc_auc"] <= 1
        assert m["selected"] in trainer.ELIGIBLE
        assert m["candidates"][m["selected"]]["eligible_to_serve"] is True
        assert (
            m["candidates"]["random_forest"]["eligible_to_serve"] is False
        )  # compared, never served
        assert m["data"]["train_rows"] + m["data"]["test_rows"] == m["data"]["rows"] == 1500
        assert "synthetic" in m["data"]["source"]
        assert "pipeline works" in m["caveat"]

    def test_version_is_traceable_and_changes_with_the_data(self):
        a = trainer.train(generate(n=800, seed=1), n_estimators=20)["model_version"]
        b = trainer.train(generate(n=800, seed=2), n_estimators=20)["model_version"]
        assert a.startswith("readiness-") and a != b

    def test_rejects_bad_datasets(self):
        with pytest.raises(ValueError, match="missing columns"):
            trainer.train(pd.DataFrame({"x": [1, 2]}))
        one_class = generate(n=200, seed=1).assign(ready=1)
        with pytest.raises(ValueError, match="both ready and not-ready"):
            trainer.train(one_class)

    def test_saves_a_loadable_artifact_and_metrics_json(self, artifact, tmp_path):
        trainer.save(artifact, tmp_path)
        assert (
            json.loads((tmp_path / "metrics.json").read_text())["model_version"]
            == artifact["model_version"]
        )
        assert Predictor.load(tmp_path / "readiness.joblib").version == artifact["model_version"]

    def test_cli_trains_from_a_csv(self, tmp_path):
        csv = tmp_path / "d.csv"
        generate(n=600, seed=9).to_csv(csv, index=False)
        assert trainer.main(["--data", str(csv), "--out", str(tmp_path / "m")]) == 0
        assert (tmp_path / "m" / "readiness.joblib").exists()


class TestMonotonicity:
    def test_the_served_model_never_contradicts_common_sense(self, artifact):
        X = generate(n=1500, seed=7)[FEATURES]
        assert trainer.respects_monotonicity(artifact["model"], X)

    def test_more_of_a_good_signal_never_lowers_the_score_for_any_student(self, artifact):
        p = Predictor(artifact)
        for base in (WEAK, GOOD):
            for f, hi in [("assessment_avg", 100), ("days_active", 30), ("mentor_engagement", 50)]:
                scores = [
                    p.predict({**base, f: v})["score"]
                    for v in range(0, int(hi) + 1, max(1, int(hi) // 10))
                ]
                assert scores == sorted(scores), f"{f} should never lower the score"
            scores = [p.predict({**base, "recency_days": v})["score"] for v in range(0, 61, 6)]
            assert scores == sorted(scores, reverse=True), (
                "more idle days should never raise the score"
            )

    def test_a_checker_that_catches_a_violating_model(self):
        class Backwards:
            def predict_proba(self, X):
                import numpy as np

                p = (
                    1 - X["assessment_avg"].to_numpy() / 100
                )  # higher assessments lower the score: wrong
                return np.column_stack([1 - p, p])

        assert not trainer.respects_monotonicity(Backwards(), generate(n=300, seed=1)[FEATURES])


class TestPredictor:
    def test_strong_students_score_higher_than_weak_ones(self, artifact):
        p = Predictor(artifact)
        good, weak = p.predict(GOOD)["score"], p.predict(WEAK)["score"]
        assert 0 <= weak < good <= 100
        assert good - weak > 40

    def test_explains_with_signed_impacts_sorted_by_size(self, artifact):
        out = Predictor(artifact).predict(WEAK)
        assert len(out["top_factors"]) == 3
        impacts = [abs(f["impact"]) for f in out["top_factors"]]
        assert impacts == sorted(impacts, reverse=True)
        # A weak student's biggest factors pull the score down.
        assert out["top_factors"][0]["direction"] == "lowers"
        assert out["top_factors"][0]["label"] and "typical" in out["top_factors"][0]

    def test_a_signal_equal_to_typical_has_no_impact(self, artifact):
        p = Predictor(artifact)
        typical = {f: p.means[f] for f in FEATURES}
        assert all(abs(f["impact"]) < 0.5 for f in p.predict(typical, top_n=7)["top_factors"])

    def test_refuses_a_model_trained_on_other_features(self, artifact):
        with pytest.raises(ValueError, match="different feature set"):
            Predictor({**artifact, "features": ["x"]})


class TestApi:
    def test_predict(self, client):
        res = client.post("/predict", json=GOOD)
        assert res.status_code == 200
        body = res.json()
        assert 0 <= body["score"] <= 100
        assert body["model_version"].startswith("readiness-")
        assert body["is_fallback"] is False
        assert len(body["top_factors"]) == 3

    def test_validates_ranges_and_required_fields(self, client):
        assert client.post("/predict", json={**GOOD, "assessment_avg": 101}).status_code == 422
        assert client.post("/predict", json={**GOOD, "days_active": 31}).status_code == 422
        assert client.post("/predict", json={**GOOD, "recency_days": -1}).status_code == 422
        incomplete = {k: v for k, v in GOOD.items() if k != "mock_eval_avg"}
        assert client.post("/predict", json=incomplete).status_code == 422

    def test_model_info_and_health(self, client):
        info = client.get("/model").json()
        assert info["features"] == FEATURES
        assert "candidates" in info["metrics"]
        assert client.get("/health").json()["model_loaded"] is True

    def test_503_when_no_model_is_loaded(self):
        original = app.state.predictor
        app.state.predictor = None
        try:
            c = TestClient(app)
            assert c.post("/predict", json=GOOD).status_code == 503
            assert c.get("/health").json()["model_loaded"] is False
        finally:
            app.state.predictor = original

    def test_prediction_metrics_are_exported(self, client):
        client.post("/predict", json=GOOD)
        text = client.get("/metrics").text
        assert "ml_predictions_total" in text and "ml_readiness_score" in text
