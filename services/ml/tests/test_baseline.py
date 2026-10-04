import json
from pathlib import Path

import pytest

import train_baseline as tb

FIXTURES = Path(__file__).resolve().parents[3] / "data" / "fixtures"
PLACEMENT = FIXTURES / "placement_sample.csv"
UCI = FIXTURES / "student_performance_sample.csv"


def test_placement_features_exclude_protected_and_leaky_columns():
    X, y = tb.load_placement(PLACEMENT)
    banned = {"gender", "salary", "sl_no", "status", "ssc_b", "hsc_b"}
    assert banned.isdisjoint(X.columns)
    assert set(y.unique()) == {0, 1}
    assert len(X) == len(y) == 60
    assert X["workex"].isin([0, 1]).all()


def test_uci_features_exclude_sex_and_prior_grades():
    X, y = tb.load_uci(UCI)
    assert {"sex", "G1", "G2", "G3", "address", "school"}.isdisjoint(X.columns)
    assert X.shape[1] == len(tb.UCI_NUMERIC) + len(tb.UCI_YES_NO)
    assert set(y.unique()) == {0, 1}
    assert X.notna().all().all()


def test_every_model_is_compared_with_a_majority_class_reference():
    X, y = tb.load_placement(PLACEMENT)
    out = tb.evaluate(X, y, repeats=1)
    assert set(out["models"]) == {
        "majority_class (reference)",
        "logistic_regression",
        "random_forest",
    }
    ref = out["models"]["majority_class (reference)"]
    assert ref["roc_auc"]["mean"] == 0.5
    for m in out["models"].values():
        assert set(m) == {"accuracy", "f1", "roc_auc"}
    # Academic percentages carry real signal even in a 60-row sample.
    assert out["models"]["logistic_regression"]["roc_auc"]["mean"] > 0.7
    assert out["cv"].startswith("5-fold")


def test_cli_writes_a_report_for_both_datasets(tmp_path):
    out = tmp_path / "baseline.json"
    code = tb.main(
        ["--placement", str(PLACEMENT), "--uci", str(UCI), "--out", str(out), "--repeats", "1"]
    )
    assert code == 0
    report = json.loads(out.read_text())
    assert set(report["datasets"]) == {"kaggle_campus_placement", "uci_student_performance"}
    assert "not the model the app serves" in report["note"]


def test_cli_needs_at_least_one_dataset(capsys):
    assert tb.main([]) == 1
    assert "--placement" in capsys.readouterr().out


@pytest.mark.parametrize("path", [PLACEMENT, UCI])
def test_fixtures_are_small(path):
    assert path.stat().st_size < 60_000
