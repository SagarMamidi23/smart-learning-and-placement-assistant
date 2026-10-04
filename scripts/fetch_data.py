"""Download all automatic datasets into data/raw/ (git-ignored).

Idempotent: anything already present is skipped unless --force is given.
Every download is recorded in data/raw/_manifest.json (source, license, retrieval time).

Usage:
    python scripts/fetch_data.py                    # O*NET, UCI, ESCO, Kaggle (if credentials exist)
    python scripts/fetch_data.py --only onet esco   # a subset
    python scripts/fetch_data.py --include-linkedin # also the LinkedIn postings dataset (opt-in, see DATA_SOURCES.md)

Kaggle credentials: ~/.kaggle/kaggle.json, or KAGGLE_USERNAME + KAGGLE_KEY env vars.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import zipfile
from pathlib import Path

import requests

from common import RAW, domain_sources, load_json, utc_now, write_json

ONET_VERSION = "31_0"
ONET_URL = f"https://www.onetcenter.org/dl_files/database/db_{ONET_VERSION}_text.zip"
ESCO_API = "https://ec.europa.eu/esco/api"
# The default ESCO version returns HTTP 500 on resource lookups, so it is pinned.
ESCO_VERSION = "v1.2.0"

KAGGLE_DATASETS = {
    "placement": "benroshan/factors-affecting-campus-placement",
    "resumes": "snehaanbhawal/resume-dataset",
}
KAGGLE_OPT_IN = {"linkedin": "arshkon/linkedin-job-postings"}

LICENSES = {
    "onet": "CC BY 4.0 (https://www.onetcenter.org/license_db.html)",
    "uci-student-performance": "CC BY 4.0",
    "esco": "European Commission reuse policy: free reuse with attribution (https://esco.ec.europa.eu/en/about-esco/terms-use)",
}

KAGGLE_HELP = """\
Kaggle credentials not found. To enable the Kaggle datasets:
  1. Sign in at https://www.kaggle.com, open Settings > API and create a token.
  2. Save the downloaded kaggle.json to ~/.kaggle/kaggle.json (Windows: C:\\Users\\<you>\\.kaggle\\kaggle.json),
     or set the KAGGLE_USERNAME and KAGGLE_KEY environment variables.
  3. Never commit this file.
Skipping Kaggle datasets."""

HEADERS = {"User-Agent": "slp-course-project/0.1 (data pipeline; educational use)"}


def log(msg: str) -> None:
    print(msg, flush=True)


def update_manifest(raw: Path, key: str, entry: dict) -> None:
    path = raw / "_manifest.json"
    manifest = load_json(path) if path.exists() else {}
    manifest[key] = {**entry, "retrieved": utc_now()}
    write_json(path, manifest)


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, stream=True, headers=HEADERS, timeout=60) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    tmp.replace(dest)


def fetch_onet(raw: Path, force: bool = False) -> Path:
    target = raw / "onet" / "extracted" / f"db_{ONET_VERSION}_text"
    if target.exists() and not force:
        log(f"onet: already present ({target.name}), skipping")
        return target
    zip_path = raw / "onet" / f"db_{ONET_VERSION}_text.zip"
    log(f"onet: downloading {ONET_URL}")
    download(ONET_URL, zip_path)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(raw / "onet" / "extracted")
    update_manifest(
        raw,
        "onet",
        {
            "url": ONET_URL,
            "version": ONET_VERSION.replace("_", "."),
            "license": LICENSES["onet"],
        },
    )
    return target


def fetch_uci(raw: Path, force: bool = False) -> Path:
    """UCI Student Performance (id 320) via ucimlrepo."""
    out = raw / "uci" / "student-performance" / "student-performance.csv"
    if out.exists() and not force:
        log("uci: already present, skipping")
        return out
    from ucimlrepo import fetch_ucirepo

    log("uci: fetching dataset id 320 via ucimlrepo")
    ds = fetch_ucirepo(id=320)
    out.parent.mkdir(parents=True, exist_ok=True)
    ds.data.original.to_csv(out, index=False)
    update_manifest(
        raw,
        "uci-student-performance",
        {
            "id": 320,
            "license": LICENSES["uci-student-performance"],
            "rows": len(ds.data.original),
        },
    )
    return out


def parse_esco_skills(resource: dict) -> list[str]:
    links = resource.get("_links", {})
    return [s["title"] for s in links.get("hasEssentialSkill", []) if s.get("title")]


def fetch_esco_occupation(term: str, session: requests.Session | None = None) -> dict | None:
    """Search ESCO for an occupation by name and return its essential skills."""
    s = session or requests.Session()
    s.headers.update(HEADERS)
    res = s.get(
        f"{ESCO_API}/search",
        params={"language": "en", "type": "occupation", "text": term, "limit": 1},
        timeout=30,
    )
    res.raise_for_status()
    hits = res.json().get("_embedded", {}).get("results", [])
    if not hits:
        return None
    uri = hits[0]["uri"]
    occ = s.get(
        f"{ESCO_API}/resource/occupation",
        params={"uri": uri, "language": "en", "selectedVersion": ESCO_VERSION},
        timeout=30,
    )
    occ.raise_for_status()
    return {
        "term": term,
        "occupation": hits[0].get("title"),
        "uri": uri,
        "version": ESCO_VERSION,
        "essential_skills": parse_esco_skills(occ.json()),
    }


def fetch_esco(raw: Path, force: bool = False, sources: dict | None = None) -> None:
    sources = sources if sources is not None else domain_sources()
    session = requests.Session()
    for slug, src in sources.items():
        out = raw / "esco" / f"{slug}.json"
        if out.exists() and not force:
            log(f"esco: {slug} already present, skipping")
            continue
        occupations = []
        for term in src.get("esco", []):
            log(f"esco: {slug} <- '{term}'")
            found = fetch_esco_occupation(term, session)
            if found:
                occupations.append(found)
            else:
                log(f"esco: no occupation found for '{term}'")
            time.sleep(0.5)  # be polite to a free public API
        write_json(out, {"domain": slug, "occupations": occupations})
    update_manifest(
        raw,
        "esco",
        {"api": ESCO_API, "version": ESCO_VERSION, "license": LICENSES["esco"]},
    )


def kaggle_credentials_present() -> bool:
    if os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"):
        return True
    kdir = Path.home() / ".kaggle"
    return (
        (kdir / "kaggle.json").exists()
        or (kdir / "access_token").exists()
        or bool(os.environ.get("KAGGLE_API_TOKEN"))
    )


def fetch_kaggle(raw: Path, datasets: dict[str, str], force: bool = False) -> None:
    if not kaggle_credentials_present():
        log(KAGGLE_HELP)
        return
    # Imported lazily: older kaggle versions authenticate (and fail) at import time.
    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    for key, slug in datasets.items():
        dest = raw / "kaggle" / key
        if dest.exists() and any(dest.iterdir()) and not force:
            log(f"kaggle: {key} already present, skipping")
            continue
        dest.mkdir(parents=True, exist_ok=True)
        log(f"kaggle: downloading {slug}")
        api.dataset_download_files(slug, path=str(dest), unzip=True, quiet=False)
        license_name = "unknown (check the dataset page)"
        try:
            meta = api.dataset_metadata(slug, path=str(dest))
            licenses = getattr(meta, "licenses", None) or []
            if licenses:
                license_name = (
                    licenses[0].get("name") or licenses[0].get("longName") or license_name
                )
        except Exception as e:  # metadata is best-effort
            log(f"kaggle: could not read license for {slug}: {e}")
        update_manifest(raw, f"kaggle-{key}", {"slug": slug, "license": license_name})
        log(f"kaggle: {key} license reported as: {license_name}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "--only",
        nargs="+",
        choices=["onet", "uci", "esco", "kaggle"],
        help="fetch only these sources",
    )
    p.add_argument("--force", action="store_true", help="re-download even if present")
    p.add_argument(
        "--include-linkedin",
        action="store_true",
        help="also download the LinkedIn job postings dataset (opt-in)",
    )
    p.add_argument("--raw-dir", type=Path, default=RAW)
    args = p.parse_args(argv)

    wanted = set(args.only or ["onet", "uci", "esco", "kaggle"])
    raw: Path = args.raw_dir
    raw.mkdir(parents=True, exist_ok=True)
    if "onet" in wanted:
        fetch_onet(raw, args.force)
    if "uci" in wanted:
        fetch_uci(raw, args.force)
    if "esco" in wanted:
        fetch_esco(raw, args.force)
    if "kaggle" in wanted:
        datasets = dict(KAGGLE_DATASETS)
        if args.include_linkedin:
            datasets.update(KAGGLE_OPT_IN)
        fetch_kaggle(raw, datasets, args.force)
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
