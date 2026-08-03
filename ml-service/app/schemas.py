from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    question: str = Field(min_length=1)
    # The judging criteria. The LLM is told to use these and nothing else.
    expected_answer_points: list[str]
    student_answer: str = Field(min_length=1)


class PointVerdict(BaseModel):
    point: str
    covered: bool
    comment: str


class AnalyzeResponse(BaseModel):
    # Per-point verdicts, so the caller can show exactly which criteria were met
    # rather than a single opaque paragraph.
    points: list[PointVerdict]
    gap_analysis: str
    suggested_answer: str
