import json
from pathlib import Path

import pytest

import ingest_study_material as ing


@pytest.fixture()
def study(tmp_path: Path) -> Path:
    civil = tmp_path / "civil"
    civil.mkdir()
    (civil / "a.pdf").write_bytes(b"%PDF-1.4 a")
    (civil / "b.pdf").write_bytes(b"%PDF-1.4 b")
    (civil / "c.pdf").write_bytes(b"%PDF-1.4 c")
    (civil / "sources.json").write_text(
        json.dumps(
            {
                "a.pdf": {"title": "Structures", "source": "NPTEL", "license": "CC BY-SA 4.0"},
                "b.pdf": {"title": "Missing license", "source": "Somewhere"},
            }
        )
    )
    law = tmp_path / "law"
    law.mkdir()
    (law / "x.pdf").write_bytes(b"%PDF-1.4 x")  # no sources.json at all
    return tmp_path


def test_plan_requires_complete_provenance(study: Path):
    jobs, warnings = ing.plan(study)
    assert [(j["domain"], j["title"]) for j in jobs] == [("civil", "Structures")]
    assert len(warnings) == 3  # b.pdf incomplete, c.pdf absent, law/x.pdf has no sources.json
    assert any("civil/b.pdf" in w for w in warnings)
    assert any("law/x.pdf" in w for w in warnings)


def test_sources_json_with_a_windows_byte_order_mark_is_accepted(tmp_path: Path):
    d = tmp_path / "civil"
    d.mkdir()
    (d / "a.pdf").write_bytes(b"%PDF-1.4 a")
    meta = {"a.pdf": {"title": "T T T", "source": "S S S", "license": "CC0"}}
    (d / "sources.json").write_bytes(b"\xef\xbb\xbf" + json.dumps(meta).encode())
    jobs, warnings = ing.plan(tmp_path)
    assert len(jobs) == 1 and warnings == []


def test_plan_can_be_limited_to_one_domain(study: Path):
    jobs, warnings = ing.plan(study, "law")
    assert jobs == []
    assert len(warnings) == 1


def test_plan_reports_a_missing_directory(tmp_path: Path):
    jobs, warnings = ing.plan(tmp_path / "nope")
    assert jobs == [] and "does not exist" in warnings[0]


class FakeResponse:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code = status
        self._body = body or {}
        self.headers = headers or {"content-type": "application/json"}
        self.text = json.dumps(self._body)

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class FakeSession:
    def __init__(self, existing=()):
        self.existing = list(existing)
        self.posted = []

    def post(self, url, json=None, data=None, files=None, timeout=None):
        if url.endswith("/auth/login"):
            return FakeResponse(200, {"user": {"role": "admin"}})
        self.posted.append((url, data, files["file"][0]))
        return FakeResponse(201, {"material": {"pages": 2, "chunkCount": 5}})

    def get(self, url, timeout=None):
        return FakeResponse(200, {"materials": self.existing})


def run(monkeypatch, study, session, argv=()):
    monkeypatch.setenv("SLP_ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("SLP_ADMIN_PASSWORD", "secret")
    monkeypatch.setattr(ing.requests, "Session", lambda: session)
    return ing.main(["--study-dir", str(study), *argv])


def test_uploads_with_metadata(monkeypatch, study, capsys):
    s = FakeSession()
    assert run(monkeypatch, study, s) == 0
    assert len(s.posted) == 1
    url, data, filename = s.posted[0]
    assert url.endswith("/api/v1/admin/study-material")
    assert data == {
        "domain": "civil",
        "title": "Structures",
        "source": "NPTEL",
        "license": "CC BY-SA 4.0",
    }
    assert filename == "a.pdf"
    assert "2 pages, 5 passages" in capsys.readouterr().out


def test_is_idempotent(monkeypatch, study, capsys):
    s = FakeSession(existing=[{"domain": "civil", "title": "Structures"}])
    assert run(monkeypatch, study, s) == 0
    assert s.posted == []
    assert "already uploaded" in capsys.readouterr().out


def test_dry_run_uploads_nothing_and_needs_no_credentials(monkeypatch, study, capsys):
    monkeypatch.delenv("SLP_ADMIN_EMAIL", raising=False)
    assert ing.main(["--study-dir", str(study), "--dry-run"]) == 0
    assert "would upload civil/a.pdf" in capsys.readouterr().out


def test_requires_credentials(monkeypatch, study, capsys):
    monkeypatch.delenv("SLP_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("SLP_ADMIN_PASSWORD", raising=False)
    assert ing.main(["--study-dir", str(study)]) == 1
    assert "SLP_ADMIN_EMAIL" in capsys.readouterr().out


def test_failed_uploads_give_a_nonzero_exit(monkeypatch, study):
    class Rejecting(FakeSession):
        def post(self, url, json=None, data=None, files=None, timeout=None):
            if url.endswith("/auth/login"):
                return super().post(url, json=json)
            return FakeResponse(422, {"error": {"message": "No text could be extracted"}})

    assert run(monkeypatch, study, Rejecting()) == 1
