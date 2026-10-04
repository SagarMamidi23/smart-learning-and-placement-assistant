from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

import retrain_from_snapshots as rt
from app.features import FEATURES
from generate_synthetic_data import generate


def snapshot(user: str, domain: str, hours_ago: int, **over):
    base = {f: 50 for f in FEATURES}
    return {
        "userId": user,
        "domain": domain,
        "createdAt": datetime(2026, 10, 1, tzinfo=timezone.utc) - timedelta(hours=hours_ago),
        "features": {**base, **over},
        "score": 61.5,
        "isFallback": False,
        "modelVersion": "readiness-test",
    }


def test_flatten_makes_one_row_per_snapshot_and_skips_incomplete_ones():
    partial = snapshot("u3", "law", 0)
    del partial["features"]["days_active"]
    df = rt.flatten([snapshot("u1", "software", 1), snapshot("u2", "civil", 2), partial])
    assert len(df) == 2
    assert list(df.columns[:3]) == ["userId", "domain", "createdAt"]
    assert set(FEATURES) <= set(df.columns)
    assert df["score"].tolist() == [61.5, 61.5]


def test_flatten_handles_no_snapshots():
    df = rt.flatten([])
    assert df.empty and "assessment_avg" in df.columns


def test_outcomes_join_to_the_latest_snapshot_per_student_and_domain():
    snaps = rt.flatten(
        [
            snapshot("u1", "software", 48, assessment_avg=10),
            snapshot("u1", "software", 1, assessment_avg=90),  # newer
            snapshot("u2", "software", 5, assessment_avg=40),
        ]
    )
    outcomes = pd.DataFrame(
        {"userId": ["u1", "u9"], "domain": ["software", "software"], "ready": [1, 0]}
    )
    joined = rt.join_outcomes(snaps, outcomes)
    assert len(joined) == 1  # u2 has no outcome and u9 has no snapshot
    assert joined.iloc[0]["assessment_avg"] == 90
    assert joined.iloc[0]["ready"] == 1


def test_outcomes_csv_must_have_the_right_columns():
    with pytest.raises(ValueError, match="needs columns"):
        rt.join_outcomes(rt.flatten([snapshot("u1", "x", 1)]), pd.DataFrame({"userId": ["u1"]}))


def test_refuses_to_retrain_on_too_little_or_one_sided_data(tmp_path):
    few = generate(n=50, seed=1)
    with pytest.raises(ValueError, match="at least"):
        rt.retrain(few, tmp_path)
    one_sided = generate(n=rt.MIN_LABELLED, seed=1).assign(ready=1)
    with pytest.raises(ValueError, match="both ready and not-ready"):
        rt.retrain(one_sided, tmp_path)


def test_retrains_and_saves_when_there_is_enough_labelled_data(tmp_path):
    artifact = rt.retrain(generate(n=400, seed=3), tmp_path, n_estimators=20)
    assert artifact["metrics"]["data"]["source"] == "mongodb_snapshots+outcomes"
    assert (tmp_path / "readiness.joblib").exists()
    assert "Trained on the supplied dataset" in artifact["metrics"]["caveat"]
