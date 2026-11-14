
import asyncio
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from resume_parser import (
    parse_jd,
    parse_resume,
    extract_text,
    match_resume,
    compute_score,
    tier,
)


app = FastAPI(
    title="ResumeAI API",
    description="AI-powered Resume Analyzer and Shortlisting API",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://talentiq-silk.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_FILES = 100

# Process at most 3 resumes simultaneously.
MAX_CONCURRENT_RESUMES = 1

@app.get("/")
def home():
    return {
        "message": "Welcome to ResumeAI API",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    return {"status": "healthy"}


def analyze_one_resume(content, original_name, extension, index, temp_dir, jd, threshold):
    """Synchronous AI processing for one resume."""

    file_path = Path(temp_dir) / f"resume_{index}{extension}"

    print(f"[{index + 1}] Starting: {original_name}", flush=True)

    file_path.write_bytes(content)

    print(f"[{index + 1}] Extracting text: {original_name}", flush=True)

    text = extract_text(file_path)

    if len(text.strip()) < 50:
        raise ValueError(
            "No readable text found. The PDF may be scanned or the file may be empty."
        )

    print(f"[{index + 1}] Parsing resume with AI: {original_name}", flush=True)

    resume = parse_resume(text)

    print(f"[{index + 1}] Matching candidate with job: {original_name}", flush=True)

    match = match_resume(jd, resume)

    score = compute_score(jd, match)

    missing_required = [
        skill
        for skill in jd.required_skills
        if skill not in match.matched_required
    ]

    print(
        f"[{index + 1}] Completed: {original_name} | Score: {score}",
        flush=True,
    )

    return {
        "file": original_name,
        "resume": resume.model_dump(),
        "score": score,
        "tier": tier(score),
        "match": match.model_dump(),
        "missing_required": missing_required,
        "status": (
            "shortlisted" if score >= threshold else "below_cutoff"
        ),
    }


@app.post("/api/analyze")
async def analyze_resumes(
    jd_text: str = Form(...),
    threshold: float = Form(60),
    resumes: list[UploadFile] = File(...),
):
    if not jd_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Job description cannot be empty.",
        )

    if not 0 <= threshold <= 100:
        raise HTTPException(
            status_code=400,
            detail="Threshold must be between 0 and 100.",
        )

    if not resumes:
        raise HTTPException(
            status_code=400,
            detail="Please upload at least one resume.",
        )

    if len(resumes) > MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_FILES} resumes allowed.",
        )

    print("\n========== NEW RESUME ANALYSIS ==========", flush=True)
    print(f"Total uploaded: {len(resumes)}", flush=True)

    # Parse the job description once.
    try:
        print("Parsing job description with AI...", flush=True)
        jd = await run_in_threadpool(parse_jd, jd_text)
        print("Job description parsed successfully.", flush=True)

    except Exception as e:
        print(f"JD parsing failed: {e}", flush=True)
        raise HTTPException(
            status_code=500,
            detail=f"Job description parsing failed: {str(e)}",
        )

    valid_files = []
    failed_files = []

    # Read and validate uploaded files.
    for index, upload in enumerate(resumes):
        original_name = Path(upload.filename or "").name
        extension = Path(original_name).suffix.lower()

        try:
            if extension not in ALLOWED_EXTENSIONS:
                failed_files.append({
                    "file": original_name,
                    "error": "Unsupported file format.",
                })
                continue

            content = await upload.read(MAX_FILE_SIZE + 1)

            if len(content) > MAX_FILE_SIZE:
                failed_files.append({
                    "file": original_name,
                    "error": "File exceeds 10 MB limit.",
                })
                continue

            if not content:
                failed_files.append({
                    "file": original_name,
                    "error": "File is empty.",
                })
                continue

            valid_files.append({
                "index": index,
                "file": original_name,
                "extension": extension,
                "content": content,
            })

        finally:
            await upload.close()

    results = []

    # Process resumes concurrently with a limit.
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_RESUMES)

    with tempfile.TemporaryDirectory() as temp_dir:

        async def process_file(item):
            async with semaphore:
                try:
                    result = await run_in_threadpool(
                        analyze_one_resume,
                        item["content"],
                        item["file"],
                        item["extension"],
                        item["index"],
                        temp_dir,
                        jd,
                        threshold,
                    )

                    return result

                except Exception as e:
                    print(
                        f"FAILED: {item['file']} | {str(e)}",
                        flush=True,
                    )

                    return {
                        "file": item["file"],
                        "error": str(e),
                        "_failed": True,
                    }

        tasks = [
            process_file(item)
            for item in valid_files
        ]

        processed = await asyncio.gather(*tasks)

        for item in processed:
            if item.get("_failed"):
                item.pop("_failed", None)
                failed_files.append(item)
            else:
                results.append(item)

    # Rank candidates.
    results.sort(
        key=lambda candidate: candidate["score"],
        reverse=True,
    )

    for rank, candidate in enumerate(results, start=1):
        candidate["rank"] = rank

    shortlisted = [
        candidate
        for candidate in results
        if candidate["score"] >= threshold
    ]

    print("\n========== ANALYSIS COMPLETE ==========", flush=True)
    print(f"Analyzed: {len(results)}", flush=True)
    print(f"Failed: {len(failed_files)}", flush=True)
    print(f"Shortlisted: {len(shortlisted)}", flush=True)

    return {
        "success": True,
        "job": jd.model_dump(),
        "threshold": threshold,
        "total_uploaded": len(resumes),
        "total_analyzed": len(results),
        "total_failed": len(failed_files),
        "total_shortlisted": len(shortlisted),
        "results": results,
        "shortlisted": shortlisted,
        "failed_files": failed_files,
    }
