# Data Sources

Every dataset the project touches, with what was verified and how. Last verified: 2026-10-04.
Raw and processed data are never committed or baked into Docker images. Committed data is limited to
`data/seeds/` (hand-written configs plus small derived files) and `data/fixtures/` (tiny samples for tests).

## Summary

| Purpose                                | Source                                                  | Status                                                                                | License                     |
| -------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------- |
| Skill benchmarks                       | O\*NET 31.0 database                                    | **Verified, downloaded, processed**                                                   | CC BY 4.0                   |
| Skill benchmarks (reference only)      | ESCO API v1.2.0                                         | **Verified, fetched, not merged** (see below)                                         | Free reuse with attribution |
| Readiness baseline (real data)         | UCI Student Performance (id 320)                        | **Verified, downloaded** (649 rows)                                                   | CC BY 4.0                   |
| Readiness baseline (real data)         | Kaggle `benroshan/factors-affecting-campus-placement`   | **Verified, downloaded** (215 rows, 15 columns)                                       | CC0 (public domain)         |
| Skill-gap testing                      | Kaggle `snehaanbhawal/resume-dataset`                   | **Verified, downloaded** (636 rows kept after mapping and capping)                    | CC0 (public domain)         |
| Opportunity seeds (jobs)               | Kaggle `arshkon/linkedin-job-postings`                  | Verified; **not downloaded, opt-in only** (166 MB, third-party scraped LinkedIn data) | CC BY-SA 4.0                |
| Opportunity seeds (exams, fellowships) | Hand-written from official notification pages           | **Done** (61 entries, links checked 2026-10-04; no deadlines seeded)                  | n/a                         |
| RAG study material                     | Manual PDFs in `data/raw/study-material/<domain-slug>/` | Manual (Phase 4)                                                                      | Per source                  |

## Details

### O\*NET 31.0 (used)

- URL: `https://www.onetcenter.org/dl_files/database/db_31_0_text.zip` (13.2 MB; "August 2026 Release" per its Read Me).
- License: Creative Commons Attribution 4.0 (https://www.onetcenter.org/license_db.html). Attribution text is carried in
  `data/seeds/skill_benchmarks.json` (`_meta.onet.attribution`).
- Files used: `Occupation Data.txt`, `Essential Skills.txt`, `Knowledge.txt`, `Software Skills.txt`.
  O\*NET 31.0 renamed the old "Skills" file to "Essential Skills".
- Use: for each domain, a handful of representative US occupations (`data/seeds/domain_sources.json`) give
  the top 6 skills and top 6 knowledge areas by importance x level, plus up to 5 hot technologies (generic Office-suite entries are
  dropped). Level (0-7) is scaled to 1-5. These are _foundation_ competencies; US occupations are only a proxy, and the
  Indian-context, exam-specific skills are hand-curated in `data/seeds/domains/*.json` (about 75% of each domain's weight).

### ESCO v1.2.0 (queried, not merged)

- API: `https://ec.europa.eu/esco/api` (no key). **The default API version returns HTTP 500 on resource lookups; the
  pipeline pins `selectedVersion=v1.2.0`.**
- Queried one occupation per domain and stored its essential skills in `data/raw/esco/`.
- Decision: not merged into `benchmarkSkills`. The essential-skill lists are unranked and include generic transversal skills
  (for example "operate open source software" appeared for a medical doctor). The derived list stays in
  `data/seeds/skill_benchmarks.json` for reference.
- License: European Commission reuse policy, free reuse with attribution. Confirm the exact terms at
  https://esco.ec.europa.eu/en/about-esco/terms-use before redistributing.

### UCI Student Performance (downloaded)

- `ucimlrepo` id 320, 649 instances, 30 features plus G1/G2/G3 grades, CC BY 4.0, two Portuguese secondary schools.
- Caveat for the report: it is a secondary-school academic dataset, so it supports a baseline for the _method_, not the placement domain.

### Kaggle datasets (licenses read through the Kaggle API on 2026-10-04)

Kaggle pages render client-side, so the license field could not be read without credentials. What was confirmed from
independent listings (not from Kaggle itself):

- `benroshan/factors-affecting-campus-placement` ("Campus Recruitment"): campus placement records with academic
  percentages, work experience, and salary for placed students.
- `snehaanbhawal/resume-dataset`: about 2,484 resumes, 24 categories (HR, Information-Technology, Teacher, Advocate, Healthcare,
  Agriculture, Banking, Construction, and others), CSV with `ID, Resume_str, Resume_html, Category`. The resumes come from livecareer.com,
  so keep it for **testing and evaluation only**; never show them to users (the pipeline drops the HTML column).
  Category mapping to our domains: `data/seeds/resume_category_map.json`. "Engineering" is deliberately unmapped because it is ambiguous.
- `arshkon/linkedin-job-postings` ("LinkedIn Job Postings (2023 - 2024)"): about 124,000 postings, mostly US. The data was scraped from
  LinkedIn by a third party, and LinkedIn's terms forbid scraping. It is therefore **opt-in** (`--include-linkedin`) and should not be used
  until the license and terms are reviewed.

`fetch_data.py` reads each dataset's license through the Kaggle API once a token is configured, and writes it to
`data/raw/_manifest.json`. Update this file with the reported licenses at that point.

### Kaggle token setup

1. Sign in at https://www.kaggle.com, Settings > API, create a token.
2. Save `kaggle.json` to `~/.kaggle/kaggle.json` (Windows: `C:\Users\<you>\.kaggle\kaggle.json`), or set
   `KAGGLE_USERNAME` and `KAGGLE_KEY`. Never commit it.

## Commands

```bash
pip install -r scripts/requirements.txt
npm run data:fetch                 # O*NET, UCI, ESCO, and Kaggle datasets when a token is present
npm run data:fetch -- --only onet  # a subset
npm run data:process               # derive data/seeds/skill_benchmarks.json (and resume_eval.csv if the Kaggle data exists)
npm run seed:domains               # load the 12 domains into MongoDB
```

Licenses reported by Kaggle: placement CC0, resumes CC0, LinkedIn postings **CC BY-SA 4.0** (share-alike, so any derived
opportunity seed data would have to be shared under the same license, one more reason it stays opt-in). The Resume Dataset is public domain on Kaggle,
but its content was collected from livecareer.com, so it remains evaluation-only.

## Committed fixtures (for tests and CI)

- `data/fixtures/placement_sample.csv`: 60 rows sampled from the Kaggle campus placement dataset (CC0).
- `data/fixtures/student_performance_sample.csv`: 120 rows sampled from the UCI Student Performance dataset (CC BY 4.0, P. Cortez and A. Silva, 2008).
- `data/fixtures/onet/` and `data/fixtures/resumes/`: see above; the resume fixture is hand-written and contains no real resumes.
