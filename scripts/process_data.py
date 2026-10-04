"""Clean and map raw datasets into the formats the app uses.

Outputs
  data/seeds/skill_benchmarks.json   (committed) O*NET + ESCO derived skills per domain. Deterministic, so
                                      `npm run seed:domains` works without the raw data.
  data/processed/resume_eval.csv     (git-ignored) Resume Dataset rows mapped to our domains, for evaluation only.

Usage:
    python scripts/process_data.py               # everything whose raw input exists
    python scripts/process_data.py --only onet
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path
from statistics import mean

from common import PROCESSED, RAW, SEEDS, domain_sources, load_json, write_json

ONET_ATTRIBUTION = (
    "This product includes information from the O*NET 31.0 Database by the U.S. Department of Labor, "
    "Employment and Training Administration (USDOL/ETA), used under the CC BY 4.0 license. "
    "O*NET is a trademark of USDOL/ETA. This project has not been approved or endorsed by USDOL/ETA."
)
ESCO_ATTRIBUTION = "Contains information from ESCO (European Skills, Competences, Qualifications and Occupations), (c) European Union."

# Fixed proficiency assigned to tools: O*NET lists software examples but gives no proficiency scale for them.
TOOL_LEVEL = 3


def read_tsv(path: Path):
    with open(path, encoding="utf-8", newline="") as f:
        yield from csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE)


def onet_version(onet_dir: Path) -> str:
    readme = onet_dir / "Read Me.txt"
    if readme.exists():
        first = readme.read_text(encoding="utf-8").splitlines()[0]
        return first.replace("O*NET", "").replace("Database", "").strip()
    return "unknown"


def element_scores(path: Path, codes: set[str]) -> dict[str, dict[str, float]]:
    """Mean importance (IM, 1-5) and level (LV, 0-7) per element, averaged across the given occupations."""
    per: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    for row in read_tsv(path):
        code = row["O*NET-SOC Code"]
        if (
            code not in codes
            or row["Recommend Suppress"] == "Y"
            or row["Scale ID"] not in ("IM", "LV")
        ):
            continue
        per[row["Element Name"]][code][row["Scale ID"]] = float(row["Data Value"])
    out = {}
    for name, by_code in per.items():
        ims = [v["IM"] for v in by_code.values() if "IM" in v]
        lvs = [v["LV"] for v in by_code.values() if "LV" in v]
        if ims and lvs:
            out[name] = {"importance": mean(ims), "level": mean(lvs)}
    return out


def to_level(onet_level: float) -> int:
    """Map O*NET's 0-7 level scale onto the app's 1-5 proficiency scale."""
    return max(1, min(5, round(onet_level / 7 * 5)))


def top_elements(
    scores: dict[str, dict[str, float]],
    n: int,
    category: str,
    exclude: frozenset[str] = frozenset(),
) -> list[dict]:
    """Highest importance x level elements. Names in `exclude` are skipped (O*NET reuses names such as
    "Mathematics" for both a skill and a knowledge area)."""

    def rank(item):
        name, s = item
        return (-(s["importance"] - 1) / 4 * (s["level"] / 7), name)

    candidates = [kv for kv in scores.items() if kv[0].lower() not in exclude]
    picked = sorted(candidates, key=rank)[:n]
    return [
        {
            "name": name,
            "level": to_level(s["level"]),
            "importance": round(s["importance"], 2),
            "category": category,
        }
        for name, s in picked
    ]


# Office-suite entries appear for nearly every occupation and say nothing about a domain.
GENERIC_TOOLS = {
    "Microsoft Office software",
    "Microsoft Word",
    "Microsoft PowerPoint",
    "Microsoft Outlook",
}


def hot_tools(path: Path, codes: set[str], n: int) -> list[dict]:
    seen: dict[str, set[str]] = defaultdict(set)
    for row in read_tsv(path):
        if (
            row["O*NET-SOC Code"] in codes
            and row["Hot Technology"] == "Y"
            and row["Workplace Example"] not in GENERIC_TOOLS
        ):
            seen[row["Workplace Example"]].add(row["O*NET-SOC Code"])
    ranked = sorted(seen.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:n]
    return [{"name": name, "level": TOOL_LEVEL, "category": "tool"} for name, _ in ranked]


def process_onet(
    onet_dir: Path,
    sources: dict,
    esco_dir: Path | None = None,
    skills_n: int = 6,
    knowledge_n: int = 6,
    tools_n: int = 5,
    esco_n: int = 6,
) -> dict:
    titles = {r["O*NET-SOC Code"]: r["Title"] for r in read_tsv(onet_dir / "Occupation Data.txt")}
    result: dict = {
        "_meta": {
            "onet": {
                "version": onet_version(onet_dir),
                "license": "CC BY 4.0",
                "attribution": ONET_ATTRIBUTION,
            },
            "esco": {"version": "v1.2.0", "attribution": ESCO_ATTRIBUTION},
            "levelMapping": "O*NET level (0-7) scaled to 1-5; tools fixed at 3",
        }
    }
    for slug, src in sources.items():
        codes = set(src["onet"])
        missing = codes - titles.keys()
        if missing:
            raise ValueError(f"{slug}: unknown O*NET-SOC codes {sorted(missing)}")
        skills = top_elements(
            element_scores(onet_dir / "Essential Skills.txt", codes), skills_n, "skill"
        )
        taken = frozenset(s["name"].lower() for s in skills)
        knowledge = top_elements(
            element_scores(onet_dir / "Knowledge.txt", codes),
            knowledge_n,
            "knowledge",
            taken,
        )
        onet = skills + knowledge + hot_tools(onet_dir / "Software Skills.txt", codes, tools_n)
        esco: list[dict] = []
        if esco_dir and (esco_dir / f"{slug}.json").exists():
            names: list[str] = []
            for occ in load_json(esco_dir / f"{slug}.json").get("occupations", []):
                for s in occ.get("essential_skills", []):
                    if s.lower() not in {x.lower() for x in names}:
                        names.append(s)
            esco = [{"name": s, "level": TOOL_LEVEL, "category": "esco"} for s in names[:esco_n]]
        result[slug] = {
            "occupations": [{"code": c, "title": titles[c]} for c in src["onet"]],
            "onet": onet,
            "esco": esco,
        }
    return result


def process_resumes(csv_path: Path, map_path: Path, out_path: Path, per_category: int = 50) -> int:
    """Keep id, category, mapped domain and plain text only (never HTML). Evaluation use only."""
    mapping = {k.upper(): v for k, v in load_json(map_path).items() if not k.startswith("_")}
    csv.field_size_limit(10_000_000)
    with open(csv_path, encoding="utf-8", newline="") as f:
        rows = sorted(csv.DictReader(f), key=lambda r: int(r["ID"]))
    taken: dict[str, int] = defaultdict(int)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "category", "domain", "text"])
        for r in rows:
            category = r["Category"].strip().upper()
            domain = mapping.get(category)
            if not domain or taken[category] >= per_category:
                continue
            taken[category] += 1
            w.writerow([r["ID"], r["Category"], domain, " ".join(r["Resume_str"].split())])
            written += 1
    return written


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--only", nargs="+", choices=["onet", "resumes"])
    p.add_argument("--raw-dir", type=Path, default=RAW)
    args = p.parse_args(argv)
    wanted = set(args.only or ["onet", "resumes"])

    if "onet" in wanted:
        onet_dirs = sorted((args.raw_dir / "onet" / "extracted").glob("db_*_text"))
        if not onet_dirs:
            print("onet: raw data missing, run `npm run data:fetch -- --only onet` first")
        else:
            result = process_onet(onet_dirs[-1], domain_sources(), args.raw_dir / "esco")
            write_json(SEEDS / "skill_benchmarks.json", result)
            print(f"onet: wrote data/seeds/skill_benchmarks.json ({len(result) - 1} domains)")

    if "resumes" in wanted:
        # The Kaggle zip nests the CSV (Resume/Resume.csv), so search recursively.
        csvs = sorted((args.raw_dir / "kaggle" / "resumes").rglob("*.csv"))
        if not csvs:
            print("resumes: raw data missing (needs Kaggle credentials), skipping")
        else:
            n = process_resumes(
                csvs[0],
                SEEDS / "resume_category_map.json",
                PROCESSED / "resume_eval.csv",
            )
            print(f"resumes: wrote {n} rows to data/processed/resume_eval.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
