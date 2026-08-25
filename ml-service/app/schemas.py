from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    question: str = Field(min_length=1)
    # The judging criteria. The LLM is told to use these and nothing else.
    expected_answer_points: list[str]
    student_answer: str = Field(min_length=1)


class PointVerdict(BaseModel):
    # Deliberately no `point` field. The caller already holds the expected
    # points and passes them in, so having the model write all five back
    # verbatim was output tokens spent to return data we sent it — the single
    # largest avoidable cost in this call. The caller re-attaches the text by
    # position; see `verdicts` in backend/src/submissions/routes.ts.
    covered: bool
    comment: str


class AnalyzeResponse(BaseModel):
    # Per-point verdicts, so the caller can show exactly which criteria were met
    # rather than a single opaque paragraph.
    points: list[PointVerdict]
    gap_analysis: str
    suggested_answer: str


class ReviewCodeRequest(BaseModel):
    question: str = Field(min_length=1)
    language: str = Field(min_length=1)
    source_code: str = Field(min_length=1)
    # Correctness is already settled by the test cases before this is ever
    # called. It is passed in so the model can be told the verdict and forbidden
    # from contradicting it — never so the model can re-decide it.
    passed_count: int
    total_count: int


class ReviewCodeResponse(BaseModel):
    summary: str
    strengths: list[str]
    improvements: list[str]
    # Best-effort commentary, not a measurement. Labelled as an estimate in the
    # UI for that reason.
    time_complexity: str
    space_complexity: str
