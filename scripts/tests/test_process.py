import csv
import json
from pathlib import Path

import pytest

from common import FIXTURES, SEEDS
from process_data import process_onet, process_resumes, to_level

ONET = FIXTURES / "onet"
SOURCES = {
    "software": {"onet": ["15-1252.00"], "esco": []},
    "civil": {"onet": ["17-2051.00"], "esco": []},
}


def test_to_level_maps_onet_scale_to_one_to_five():
    assert to_level(0) == 1  # clamped up
    assert to_level(3.5) == 2
    assert to_level(7) == 5
    assert to_level(6.9) == 5


def test_process_onet_shape_and_ranges():
    out = process_onet(ONET, SOURCES)
    assert out["_meta"]["onet"]["version"] == "31.0"
    assert "CC BY 4.0" in out["_meta"]["onet"]["license"]
    for slug in SOURCES:
        items = out[slug]["onet"]
        cats = [i["category"] for i in items]
        assert cats.count("skill") == 6
        assert cats.count("knowledge") == 6
        assert 1 <= cats.count("tool") <= 5
        assert all(1 <= i["level"] <= 5 for i in items)
        assert len({i["name"] for i in items}) == len(items)


def test_domains_get_different_benchmarks():
    out = process_onet(ONET, SOURCES)
    names = {
        slug: {i["name"] for i in out[slug]["onet"] if i["category"] == "knowledge"}
        for slug in SOURCES
    }
    assert "Computers and Electronics" in names["software"]
    assert "Engineering and Technology" in names["civil"]
    assert "Building and Construction" in names["civil"]
    assert "Building and Construction" not in names["software"]


def test_generic_office_tools_are_excluded():
    out = process_onet(ONET, SOURCES)
    tools = {i["name"] for slug in SOURCES for i in out[slug]["onet"] if i["category"] == "tool"}
    assert tools.isdisjoint({"Microsoft Office software", "Microsoft Word", "Microsoft PowerPoint"})


def test_process_onet_is_deterministic():
    assert process_onet(ONET, SOURCES) == process_onet(ONET, SOURCES)


def test_unknown_soc_code_is_rejected():
    with pytest.raises(ValueError, match="unknown O\\*NET-SOC codes"):
        process_onet(ONET, {"x": {"onet": ["99-9999.00"]}})


def test_esco_skills_are_merged_and_deduplicated(tmp_path: Path):
    esco = tmp_path / "esco"
    esco.mkdir()
    (esco / "civil.json").write_text(
        json.dumps(
            {
                "domain": "civil",
                "occupations": [
                    {
                        "essential_skills": [
                            "bridge engineering",
                            "Surveying",
                            "surveying",
                        ]
                    },
                    {"essential_skills": ["Bridge Engineering", "soil mechanics"]},
                ],
            }
        ),
        encoding="utf-8",
    )
    out = process_onet(ONET, SOURCES, esco_dir=esco)
    assert [s["name"] for s in out["civil"]["esco"]] == [
        "bridge engineering",
        "Surveying",
        "soil mechanics",
    ]
    assert out["software"]["esco"] == []


def test_resume_mapping_drops_unmapped_html_and_caps_per_category(tmp_path: Path):
    out = tmp_path / "resume_eval.csv"
    n = process_resumes(
        FIXTURES / "resumes" / "resume_sample.csv",
        SEEDS / "resume_category_map.json",
        out,
        per_category=2,
    )
    with open(out, encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    assert n == len(rows)
    assert set(rows[0]) == {"id", "category", "domain", "text"}  # no HTML column
    assert {r["category"] for r in rows}.isdisjoint({"CHEF", "ENGINEERING"})  # unmapped categories
    assert sum(r["category"] == "INFORMATION-TECHNOLOGY" for r in rows) == 2  # capped
    assert {r["id"] for r in rows if r["category"] == "FINANCE"} == {"10005"}
    assert {r["domain"] for r in rows if r["category"] in ("BANKING", "FINANCE", "ACCOUNTANT")} == {
        "banking"
    }
