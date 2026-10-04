"""Upload study-material PDFs to the API, which chunks, embeds and indexes them for the RAG mentor.

Layout (you add the PDFs; they are git-ignored):
    data/raw/study-material/<domain-slug>/*.pdf
    data/raw/study-material/<domain-slug>/sources.json   {"file.pdf": {"title": ..., "source": ..., "license": ...}}

Every file needs an entry in sources.json: the mentor quotes these documents, so where each came from and its
license must be recorded. Files without an entry are skipped with a warning. Already-uploaded documents (same
domain and title) are skipped, so the script is safe to re-run.

Credentials come from the environment, never the command line:
    SLP_API_URL (default http://localhost:4000), SLP_ADMIN_EMAIL, SLP_ADMIN_PASSWORD

Usage:
    python scripts/ingest_study_material.py
    python scripts/ingest_study_material.py --domain civil --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

from common import RAW, load_json

STUDY_DIR = RAW / "study-material"
REQUIRED = ("title", "source", "license")


def log(msg: str) -> None:
    print(msg, flush=True)


def plan(study_dir: Path, only_domain: str | None = None) -> tuple[list[dict], list[str]]:
    """Files to upload (with metadata) and warnings about files that can't be."""
    jobs: list[dict] = []
    warnings: list[str] = []
    if not study_dir.exists():
        return jobs, [f"{study_dir} does not exist; create it and add PDFs per domain"]
    for domain_dir in sorted(p for p in study_dir.iterdir() if p.is_dir()):
        if only_domain and domain_dir.name != only_domain:
            continue
        sources_path = domain_dir / "sources.json"
        sources = load_json(sources_path) if sources_path.exists() else {}
        for pdf in sorted(domain_dir.glob("*.pdf")):
            meta = sources.get(pdf.name)
            if not meta or any(not str(meta.get(k, "")).strip() for k in REQUIRED):
                warnings.append(
                    f"{domain_dir.name}/{pdf.name}: no complete entry (title, source, license) in sources.json, skipped"
                )
                continue
            jobs.append({"domain": domain_dir.name, "path": pdf, **{k: meta[k] for k in REQUIRED}})
    return jobs, warnings


def login(session: requests.Session, base: str, email: str, password: str) -> None:
    res = session.post(
        f"{base}/api/v1/auth/login", json={"email": email, "password": password}, timeout=30
    )
    if res.status_code != 200:
        raise SystemExit(
            f"login failed ({res.status_code}); check SLP_ADMIN_EMAIL / SLP_ADMIN_PASSWORD"
        )
    if res.json().get("user", {}).get("role") != "admin":
        raise SystemExit("that account is not an admin")


def existing_titles(session: requests.Session, base: str) -> set[tuple[str, str]]:
    res = session.get(f"{base}/api/v1/admin/study-material", timeout=30)
    res.raise_for_status()
    return {(m["domain"], m["title"]) for m in res.json()["materials"]}


def upload(session: requests.Session, base: str, job: dict) -> dict:
    with open(job["path"], "rb") as f:
        res = session.post(
            f"{base}/api/v1/admin/study-material",
            data={k: job[k] for k in ("domain", "title", "source", "license")},
            files={"file": (job["path"].name, f, "application/pdf")},
            timeout=600,
        )
    if res.status_code != 201:
        message = (
            res.json().get("error", {}).get("message", res.text[:200])
            if res.headers.get("content-type", "").startswith("application/json")
            else res.text[:200]
        )
        raise RuntimeError(f"{res.status_code}: {message}")
    return res.json()["material"]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--domain", help="only this domain slug")
    p.add_argument("--dry-run", action="store_true", help="show what would be uploaded")
    p.add_argument("--study-dir", type=Path, default=STUDY_DIR)
    args = p.parse_args(argv)

    jobs, warnings = plan(args.study_dir, args.domain)
    for w in warnings:
        log(f"warning: {w}")
    if not jobs:
        log("nothing to upload")
        return 0
    if args.dry_run:
        for j in jobs:
            log(f"would upload {j['domain']}/{j['path'].name} as '{j['title']}' ({j['license']})")
        return 0

    base = os.environ.get("SLP_API_URL", "http://localhost:4000").rstrip("/")
    email, password = os.environ.get("SLP_ADMIN_EMAIL"), os.environ.get("SLP_ADMIN_PASSWORD")
    if not email or not password:
        log(
            "Set SLP_ADMIN_EMAIL and SLP_ADMIN_PASSWORD (an admin account; see `npm run create-user -w @slp/api`)."
        )
        return 1

    session = requests.Session()
    login(session, base, email, password)
    done = existing_titles(session, base)
    failures = 0
    for job in jobs:
        key = (job["domain"], job["title"])
        if key in done:
            log(f"skip   {job['domain']}/{job['path'].name} (already uploaded)")
            continue
        try:
            m = upload(session, base, job)
            log(
                f"ok     {job['domain']}/{job['path'].name}: {m['pages']} pages, {m['chunkCount']} passages"
            )
        except RuntimeError as e:
            failures += 1
            log(f"FAILED {job['domain']}/{job['path'].name}: {e}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
