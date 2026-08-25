from pathlib import Path

from dotenv import load_dotenv

# Explicit path, not a bare load_dotenv(): that searches upward from the CURRENT
# WORKING DIRECTORY, so launching uvicorn from the repo root with --app-dir
# silently found no .env and the service failed with "GEMINI_API_KEY is not set"
# even though the file was sitting right there. Anchoring to this file's own
# location makes the service start correctly from anywhere.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")  # before llm.py reads the key

from fastapi import FastAPI, HTTPException  # noqa: E402

from .llm import LLMError, analyze_answer, review_code  # noqa: E402
from .schemas import (  # noqa: E402
    AnalyzeRequest,
    AnalyzeResponse,
    ReviewCodeRequest,
    ReviewCodeResponse,
)

app = FastAPI(title="mock-interview ml-service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ml-service"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """Compare a student's answer against the supplied expected points.

    Deliberately stateless: the caller owns the question and its criteria, and
    this service never reads the database. It grades exactly what it is handed.
    """
    try:
        return analyze_answer(req)
    except LLMError as exc:
        # 502: this service is fine, the upstream provider is not. Distinct from
        # a 400 (bad input) or 500 (bug in here).
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/review-code", response_model=ReviewCodeResponse)
def review(req: ReviewCodeRequest) -> ReviewCodeResponse:
    """Comment on a code submission's approach and quality.

    Never decides correctness — the caller has already established that with
    test cases and passes the verdict in, so the model can be told it and
    forbidden from revisiting it.
    """
    if req.total_count < 1:
        raise HTTPException(
            status_code=400, detail="total_count must be at least 1"
        )
    if not 0 <= req.passed_count <= req.total_count:
        raise HTTPException(
            status_code=400, detail="passed_count must be between 0 and total_count"
        )

    try:
        return review_code(req)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
