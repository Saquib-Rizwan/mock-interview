from dotenv import load_dotenv

load_dotenv()  # must run before llm.py reads GEMINI_API_KEY

from fastapi import FastAPI, HTTPException  # noqa: E402

from .llm import LLMError, analyze_answer  # noqa: E402
from .schemas import AnalyzeRequest, AnalyzeResponse  # noqa: E402

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
