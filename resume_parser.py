import os
import csv
import json
import argparse
from pathlib import Path
from typing import TypeVar
import time
from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel, ValidationError
from pypdf import PdfReader
from docx import Document

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    raise ValueError("GROQ_API_KEY not found in .env")

client = Groq(
    api_key=api_key,
    timeout=90.0,
    max_retries=0,
)
MODEL = "openai/gpt-oss-120b"
MAX_CHARS = 15000
CACHE_FILE = Path("parsed_cache.json")

T = TypeVar("T", bound=BaseModel)


# ---------- Schemas ----------
class Education(BaseModel):
    institution: str | None = None
    degree: str | None = None
    field: str | None = None
    end_year: int | None = None


class Experience(BaseModel):
    company: str | None = None
    title: str | None = None
    start_date: str | None = None
    end_date: str | None = None          # "Present" if current
    summary: str | None = None


class Resume(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin: str | None = None
    summary: str | None = None
    skills: list[str] = []
    education: list[Education] = []
    experience: list[Experience] = []
    certifications: list[str] = []
    total_years_experience: float | None = None


class JobDescription(BaseModel):
    title: str | None = None
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    min_years_experience: float | None = None
    education_requirement: str | None = None
    summary: str | None = None


class Match(BaseModel):
    matched_required: list[str] = []     # must come from the JD's required list
    matched_preferred: list[str] = []    # must come from the JD's preferred list
    relevant_experience_years: float | None = None
    reasoning: str = ""                  # 1-2 sentences


# ---------- Text extraction (resumes and JDs) ----------
def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(str(path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if suffix == ".docx":
        doc = Document(str(path))
        parts = [p.text for p in doc.paragraphs]
        for table in doc.tables:             # many resumes keep content in tables
            for row in table.rows:
                parts.append(" | ".join(cell.text for cell in row.cells))
        return "\n".join(parts)
    if suffix == ".txt":
        return path.read_text(encoding="utf-8", errors="ignore")
    if suffix == ".doc":
        raise ValueError("Old .doc format isn't supported. Save it as .docx first.")
    raise ValueError(f"Unsupported file type: {suffix}")


# ---------- Generic LLM call with schema + validation + retry ----------

def ask_llm(model_cls: type[T], system: str, user: str, retries: int = 2) -> T:
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": model_cls.__name__.lower(),
            "schema": model_cls.model_json_schema(),
        },
    }

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    validation_attempts = 0
    rate_limit_attempts = 0

    while True:
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=messages,
                response_format=response_format,
                temperature=0,
            )

            return model_cls.model_validate_json(
                response.choices[0].message.content
            )

        except ValidationError:
            validation_attempts += 1

            if validation_attempts > retries:
                raise

            print(
                f"Invalid AI response. Retrying "
                f"({validation_attempts}/{retries})...",
                flush=True,
            )

        except Exception as e:
            status_code = getattr(e, "status_code", None)

            if status_code != 429:
                raise

            rate_limit_attempts += 1

            if rate_limit_attempts > 5:
                raise RuntimeError(
                    "Groq rate limit exceeded after 5 retries. "
                    "Please try again later."
                ) from e

            wait_seconds = [8, 15, 25, 35, 45][
                rate_limit_attempts - 1
            ]

            print(
                f"Groq rate limit reached. "
                f"Waiting {wait_seconds} seconds before retry "
                f"({rate_limit_attempts}/5)...",
                flush=True,
            )

            time.sleep(wait_seconds)

# ---------- Prompts ----------
RESUME_PROMPT = (
    "You are a resume parser for an HR team. Extract the candidate's details "
    "from the resume text and return them as JSON. "
    "Only use information that is explicitly in the resume. "
    "If a field is missing, use null (or an empty list). Never guess or invent. "
    "List skills as short individual items. "
    "Estimate total_years_experience only if dates make it clear."
)

JD_PROMPT = (
    "You are an HR assistant. Extract the hiring requirements from this job "
    "description and return them as JSON. Put must-have skills in required_skills "
    "and nice-to-haves in preferred_skills, as short individual items. "
    "Only use what the job description states. Use null or empty lists if missing."
)

MATCH_PROMPT = (
    "You compare a candidate against job requirements. Return JSON. "
    "matched_required: which of the JOB's required_skills the candidate clearly "
    "demonstrates (via skills or experience; related tools count, e.g. PyTorch "
    "for 'deep learning'). Copy each item exactly as written in the job's list. "
    "matched_preferred: same for preferred_skills. "
    "relevant_experience_years: years of experience relevant to this job, or null "
    "if it can't be determined. reasoning: 1-2 factual sentences. "
    "Be strict: do not credit skills with no evidence."
)


# ---------- Parsing ----------
def parse_resume(text: str) -> Resume:
    return ask_llm(Resume, RESUME_PROMPT, f"Resume text:\n\n{text[:MAX_CHARS]}")


def parse_jd(text: str) -> JobDescription:
    return ask_llm(JobDescription, JD_PROMPT, f"Job description:\n\n{text[:MAX_CHARS]}")


# ---------- Matching and scoring ----------
def _keep_only(items: list[str], allowed: list[str]) -> list[str]:
    """Drop anything the model returned that isn't in the JD's own list."""
    lookup = {s.lower(): s for s in allowed}
    return list(dict.fromkeys(lookup[i.lower()] for i in items if i.lower() in lookup))


def match_resume(jd: JobDescription, resume: Resume) -> Match:
    # Personal details are removed so the match can't be influenced by them.
    candidate = resume.model_dump(
        exclude={"full_name", "email", "phone", "linkedin", "location"}
    )
    user = (
        f"JOB REQUIREMENTS:\n{jd.model_dump_json(indent=2)}\n\n"
        f"CANDIDATE:\n{json.dumps(candidate, indent=2)}"
    )
    m = ask_llm(Match, MATCH_PROMPT, user)
    m.matched_required = _keep_only(m.matched_required, jd.required_skills)
    m.matched_preferred = _keep_only(m.matched_preferred, jd.preferred_skills)
    return m


def compute_score(jd: JobDescription, m: Match) -> float:
    parts = []  # (weight, value between 0 and 1)
    if jd.required_skills:
        parts.append((0.60, len(m.matched_required) / len(jd.required_skills)))
    if jd.preferred_skills:
        parts.append((0.15, len(m.matched_preferred) / len(jd.preferred_skills)))
    if jd.min_years_experience and m.relevant_experience_years is not None:
        parts.append((0.25, min(m.relevant_experience_years / jd.min_years_experience, 1)))
    if not parts:
        return 0.0
    total_weight = sum(w for w, _ in parts)
    return round(100 * sum(w * v for w, v in parts) / total_weight, 1)


def tier(score: float) -> str:
    if score >= 75:
        return "strong match"
    if score >= 50:
        return "possible match"
    return "weak match"


# ---------- Cache so resumes aren't re-parsed on every run ----------
def load_cache() -> dict:
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def get_resume(path: Path, cache: dict) -> Resume | None:
    key, mtime = path.name, path.stat().st_mtime
    if key in cache and cache[key]["mtime"] == mtime:
        return Resume.model_validate(cache[key]["resume"])
    text = extract_text(path)
    if len(text.strip()) < 50:
        print("  Skipped: no readable text (scanned PDF?)")
        return None
    resume = parse_resume(text)
    cache[key] = {"mtime": mtime, "resume": resume.model_dump()}
    return resume


# ---------- Main ----------
def main():
    ap = argparse.ArgumentParser(description="AI resume parser and JD matcher")
    ap.add_argument("--resumes", default="resumes", help="folder of resumes")
    ap.add_argument("--jd", help="job description file (.txt, .pdf, .docx)")
    ap.add_argument("--threshold", type=float, default=60, help="minimum score to shortlist")
    args = ap.parse_args()

    jd = None
    if args.jd:
        jd = parse_jd(extract_text(Path(args.jd)))
        print(f"Job: {jd.title}")
        print(f"  Required: {', '.join(jd.required_skills)}")
        print(f"  Preferred: {', '.join(jd.preferred_skills)}")
        print(f"  Min years: {jd.min_years_experience}\n")

    cache = load_cache()
    rows = []
    for path in sorted(Path(args.resumes).iterdir()):
        if path.suffix.lower() not in {".pdf", ".docx", ".txt"}:
            continue
        print(f"Processing {path.name} ...")
        try:
            resume = get_resume(path, cache)
            if resume is None:
                continue
            row = {"file": path.name, "resume": resume.model_dump()}
            if jd:
                m = match_resume(jd, resume)
                row["score"] = compute_score(jd, m)
                row["tier"] = tier(row["score"])
                row["match"] = m.model_dump()
                row["missing_required"] = [
                    s for s in jd.required_skills if s not in m.matched_required
                ]
            rows.append(row)
        except Exception as e:
            print(f"  Failed: {e}")

    CACHE_FILE.write_text(json.dumps(cache, indent=2), encoding="utf-8")

    if not jd:
        Path("parsed_resumes.json").write_text(
            json.dumps([r["resume"] | {"file": r["file"]} for r in rows], indent=2),
            encoding="utf-8",
        )
        print(f"\nParsed {len(rows)} resumes -> parsed_resumes.json")
        return

    rows.sort(key=lambda r: r["score"], reverse=True)
    Path("ranked_results.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")

    shortlist = [r for r in rows if r["score"] >= args.threshold]
    with open("shortlist.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rank", "file", "name", "email", "phone", "score", "tier",
                    "matched_required", "missing_required", "reasoning"])
        for i, r in enumerate(shortlist, 1):
            p, m = r["resume"], r["match"]
            w.writerow([i, r["file"], p["full_name"], p["email"], p["phone"],
                        r["score"], r["tier"], ", ".join(m["matched_required"]),
                        ", ".join(r["missing_required"]), m["reasoning"]])

    print("\n=== Ranking ===")
    for r in rows:
        flag = "SHORTLIST" if r["score"] >= args.threshold else "below cutoff"
        print(f"{r['score']:5.1f}  {r['tier']:<14} {flag:<13} {r['file']}")
    print(f"\n{len(shortlist)}/{len(rows)} shortlisted -> shortlist.csv "
          f"(all candidates ranked in ranked_results.json)")


if __name__ == "__main__":
    main()