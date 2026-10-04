import json
from pathlib import Path

import fetch_data


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self):
        self.headers = {}
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        if url.endswith("/search"):
            return FakeResponse(
                {
                    "_embedded": {
                        "results": [{"uri": "http://esco/occ/1", "title": "civil engineer"}]
                    }
                }
            )
        return FakeResponse(
            {
                "_links": {
                    "hasEssentialSkill": [
                        {"title": "bridge engineering"},
                        {"title": "approve engineering design"},
                    ]
                }
            }
        )


def test_parse_esco_skills_ignores_untitled_links():
    assert fetch_data.parse_esco_skills(
        {"_links": {"hasEssentialSkill": [{"title": "a"}, {}]}}
    ) == ["a"]
    assert fetch_data.parse_esco_skills({}) == []


def test_esco_lookup_pins_the_version():
    s = FakeSession()
    out = fetch_data.fetch_esco_occupation("civil engineer", s)
    assert out["occupation"] == "civil engineer"
    assert out["essential_skills"] == [
        "bridge engineering",
        "approve engineering design",
    ]
    resource_call = [c for c in s.calls if "resource/occupation" in c[0]][0]
    assert resource_call[1]["selectedVersion"] == fetch_data.ESCO_VERSION


def test_esco_lookup_returns_none_when_no_hit():
    class Empty(FakeSession):
        def get(self, url, params=None, timeout=None):
            return FakeResponse({"_embedded": {"results": []}})

    assert fetch_data.fetch_esco_occupation("zzz", Empty()) is None


def test_fetch_esco_is_idempotent(tmp_path: Path, monkeypatch):
    calls = []
    monkeypatch.setattr(
        fetch_data,
        "fetch_esco_occupation",
        lambda term, session=None: calls.append(term) or None,
    )
    monkeypatch.setattr(fetch_data.time, "sleep", lambda s: None)
    sources = {"civil": {"esco": ["civil engineer"]}}
    fetch_data.fetch_esco(tmp_path, sources=sources)
    fetch_data.fetch_esco(tmp_path, sources=sources)  # second run must skip
    assert calls == ["civil engineer"]
    assert json.loads((tmp_path / "esco" / "civil.json").read_text())["occupations"] == []
    assert "esco" in json.loads((tmp_path / "_manifest.json").read_text())


def test_kaggle_credentials_detection(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(fetch_data.Path, "home", lambda: tmp_path)
    for var in ("KAGGLE_USERNAME", "KAGGLE_KEY", "KAGGLE_API_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    assert not fetch_data.kaggle_credentials_present()
    (tmp_path / ".kaggle").mkdir()
    (tmp_path / ".kaggle" / "kaggle.json").write_text("{}")
    assert fetch_data.kaggle_credentials_present()


def test_kaggle_without_credentials_prints_help_and_does_not_download(
    tmp_path: Path, monkeypatch, capsys
):
    monkeypatch.setattr(fetch_data, "kaggle_credentials_present", lambda: False)
    fetch_data.fetch_kaggle(tmp_path, fetch_data.KAGGLE_DATASETS)
    assert "kaggle.json" in capsys.readouterr().out
    assert not (tmp_path / "kaggle").exists()


def test_linkedin_is_opt_in():
    assert "linkedin" not in fetch_data.KAGGLE_DATASETS
    assert fetch_data.KAGGLE_OPT_IN["linkedin"] == "arshkon/linkedin-job-postings"
