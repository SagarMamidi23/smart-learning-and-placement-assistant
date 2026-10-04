"""Shared paths and small helpers for the data pipeline scripts."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "raw"
PROCESSED = DATA / "processed"
SEEDS = DATA / "seeds"
FIXTURES = DATA / "fixtures"

DOMAIN_SOURCES = SEEDS / "domain_sources.json"


def load_json(path: Path):
    # utf-8-sig: Windows editors and PowerShell often write a byte-order mark, which plain utf-8 rejects.
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


def domain_sources(path: Path = DOMAIN_SOURCES) -> dict:
    """Domain slug -> {"onet": [...], "esco": [...]}. Keys starting with "_" are comments."""
    return {k: v for k, v in load_json(path).items() if not k.startswith("_")}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
