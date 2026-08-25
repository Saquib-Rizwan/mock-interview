const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000";

export const TOKEN_KEY = "mockinterview.token";

export type User = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

export type AuthResponse = { token: string; user: User };

export type RoundType =
  | "aptitude"
  | "technical"
  | "hr"
  | "coding"
  | "group_discussion"
  | "managerial"
  | "other";

// Must stay in sync with the QuestionCategory enum in prisma/schema.prisma.
// Adding a value there without adding it here makes the badge render blank.
export type QuestionCategory =
  | "company_specific"
  | "os"
  | "cn"
  | "dbms"
  | "dsa"
  | "oops"
  | "general_hr"
  | "aptitude"
  | "other"
  | "c_programming"
  | "python"
  | "cloud";

export type Difficulty = "easy" | "medium" | "hard";

/**
 * Eligibility as the placement material stated it. Three states, and the
 * difference matters — see the Role comment in prisma/schema.prisma.
 *
 *   openToAllBranches       the source explicitly said "All Branches"
 *   eligibleBranches = []   the source said nothing; unknown, NOT open to all
 *   minCgpa = null          no cutoff was stated, NOT "there is no cutoff"
 */
export type Eligibility = {
  eligibleBranches: string[];
  openToAllBranches: boolean;
  minCgpa: number | null;
};

export type RoleEligibility = { id: string; name: string } & Eligibility;

export type CompanySummary = {
  id: string;
  name: string;
  roleCount: number;
  /** Full roles, so search and filtering happen in the browser. */
  roles: RoleEligibility[];
};
export type RoleSummary = { id: string; name: string; roundCount: number };

export type CompanyDetail = {
  id: string;
  name: string;
  roles: RoleSummary[];
};

export type RoundSummary = {
  id: string;
  order: number;
  roundType: RoundType;
  roundName: string;
  notes: string | null;
  questionCount: number;
  /**
   * How many of this round's questions this user has attempted at least once.
   * Coverage, not score — a wrong answer still counts as answered, and the
   * progress page is what grades. Always <= questionCount.
   */
  answeredCount: number;
};

export type RoleDetail = {
  id: string;
  name: string;
  eligibleBranches: string[];
  openToAllBranches: boolean;
  minCgpa: number | null;
  company: { id: string; name: string };
  rounds: RoundSummary[];
};

// expectedAnswerPoints is intentionally absent — the server does not send it.
export type QuestionSummary = {
  id: string;
  text: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  questionType: "text" | "coding" | "mcq";
  /** Whether this user has a saved attempt at it. Never reveals the score. */
  attempted: boolean;
};

export type QuestionDetail = {
  id: string;
  text: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  questionType: "text" | "coding" | "mcq";
  // How many criteria the answer is graded against. The criteria themselves
  // stay on the server.
  expectedPointCount: number;
  /**
   * Choices for an MCQ, null for anything else. The correct index and the
   * worked solution are NOT part of this type and are never sent while a test
   * is in progress — see the select in backend/src/catalog/routes.ts.
   */
  options: string[] | null;
};

/**
 * An MCQ as it is presented while a test is being taken. There is deliberately
 * no `correctIndex` and no `solution` on this type: the server never sends them
 * before submission, and having no field for them means a careless render
 * cannot reveal one.
 */
export type AssessmentQuestion = {
  id: string;
  text: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  options: string[];
};

export type AssessmentSection = {
  id: string;
  order: number;
  name: string;
  durationMin: number | null;
  marksPerQuestion: number;
  questions: AssessmentQuestion[];
};

export type AssessmentDetail = {
  id: string;
  totalDurationMin: number | null;
  /** Marks lost per wrong answer. Null means none applies. */
  negativeMarking: number | null;
  canRevisit: boolean;
  round: {
    id: string;
    roundName: string;
    role: { id: string; name: string; company: { id: string; name: string } };
  };
  sections: AssessmentSection[];
};

/** Summary of a round's assessment, when it has one. */
export type RoundAssessment = {
  id: string;
  totalDurationMin: number | null;
  negativeMarking: number | null;
};

export type Attempt = {
  id: string;
  startedAt: string;
  answers: Record<string, number>;
};

export type AttemptResult = {
  score: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  negativeMarking: number | null;
  elapsedSec: number;
};

/**
 * A question as it appears AFTER submission. This is the only shape that
 * carries `correctIndex` and `solution`, and the server only fills it once the
 * attempt has a submittedAt — see the 409 in the review route.
 */
export type ReviewQuestion = {
  id: string;
  text: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  options: string[];
  correctIndex: number | null;
  solution: string | null;
  chosenIndex: number | null;
  correct: boolean;
  /** Signed: positive for correct, negative for a wrong answer, 0 if skipped. */
  marks: number;
};

export type AttemptReview = {
  roundId: string;
  roundName: string;
  negativeMarking: number | null;
  submittedAt: string;
  sections: { id: string; name: string; questions: ReviewQuestion[] }[];
};

export type PointVerdict = { point: string; covered: boolean; comment: string };

// Must stay in sync with the CodingLanguage enum in prisma/schema.prisma.
export type CodingLanguage = "python" | "javascript" | "cpp" | "java";

export type LanguageOption = {
  id: CodingLanguage;
  label: string;
  // Monaco's own identifier, which differs from ours for some languages.
  monacoId: string;
};

export type SampleTest = { id: string; input: string; expected: string };

// Hidden test cases contribute only to hiddenTestCount — their inputs and
// expected values never leave the server.
export type CodingQuestionDetail = {
  id: string;
  text: string;
  difficulty: Difficulty;
  category: QuestionCategory;
  functionName: string;
  paramTypes: string[];
  returnType: string;
  starterCode: Record<CodingLanguage, string>;
  sampleTests: SampleTest[];
  hiddenTestCount: number;
  languages: LanguageOption[];
};

// input/expected/actual are present for sample cases only.
export type TestOutcome = {
  testCaseId: string;
  orderIndex: number;
  isSample: boolean;
  passed: boolean;
  error: string | null;
  input?: string;
  expected?: string;
  actual?: string | null;
};

// Commentary on approach and quality only. Correctness is decided by the test
// cases before this is ever requested, and the model is forbidden from
// contradicting that verdict.
export type CodeReview = {
  summary: string;
  strengths: string[];
  improvements: string[];
  // Snake_case because these come straight through from ml-service.
  time_complexity: string;
  space_complexity: string;
};

export type CodeSubmission = {
  id: string;
  questionId?: string;
  language: CodingLanguage;
  sourceCode?: string;
  passedCount: number;
  totalCount: number;
  createdAt: string;
  // Null until the student asks for a review.
  review?: CodeReview | null;
};

// coveragePct is null when nothing in that subject has been scored yet — which
// must render differently from a genuine 0%.
export type SubjectProgress = {
  category: QuestionCategory;
  attempts: number;
  scoredAttempts: number;
  coveragePct: number | null;
};

export type LanguageProgress = {
  language: CodingLanguage;
  attempts: number;
  solved: number;
  testPassRatePct: number | null;
};

export type RecurringGap = {
  point: string;
  missed: number;
  seen: number;
  category: QuestionCategory;
};

export type RoleReadiness = {
  companyId: string;
  companyName: string;
  roleId: string;
  roleName: string;
  totalQuestions: number;
  attempted: number;
  pct: number;
};

export type RecentActivity = {
  kind: "text" | "coding";
  id: string;
  questionId: string;
  questionText: string;
  category: QuestionCategory;
  createdAt: string;
  covered: number | null;
  total: number | null;
};

export type Progress = {
  totals: {
    textQuestions: number;
    textAttempts: number;
    codingQuestions: number;
    codingSolved: number;
    codingAttempts: number;
  };
  subjects: SubjectProgress[];
  languages: LanguageProgress[];
  recurringGaps: RecurringGap[];
  readiness: RoleReadiness[];
  recent: RecentActivity[];
};

export type RunResult = {
  compileError: string | null;
  submission: CodeSubmission | null;
  timedOut?: boolean;
  results: TestOutcome[];
};

export type Submission = {
  id: string;
  questionId?: string;
  answerText: string;
  gapAnalysis: string;
  suggestedAnswer: string;
  createdAt: string;
};

export type RoundDetail = {
  id: string;
  order: number;
  roundType: RoundType;
  roundName: string;
  notes: string | null;
  role: { id: string; name: string; company: { id: string; name: string } };
  questions: QuestionSummary[];
  /** Non-null only when this round is a timed test rather than a conversation. */
  assessment: RoundAssessment | null;
};

// Thrown for any non-2xx response so callers can show the server's message
// rather than a generic failure.
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  // A failing endpoint may return HTML (e.g. a proxy error), so tolerate a
  // body that isn't JSON instead of throwing an unhelpful parse error.
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(body?.error ?? `Request failed (HTTP ${res.status})`, res.status);
  }
  return body as T;
}

export const api = {
  signup: (email: string, password: string, name?: string) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: User }>("/auth/me"),

  // Revokes every token issued to this user. Returns 204, hence the void body.
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  companies: () => request<{ companies: CompanySummary[] }>("/catalog/companies"),
  company: (id: string) => request<{ company: CompanyDetail }>(`/catalog/companies/${id}`),
  role: (id: string) => request<{ role: RoleDetail }>(`/catalog/roles/${id}`),
  round: (id: string) => request<{ round: RoundDetail }>(`/catalog/rounds/${id}`),
  question: (id: string) =>
    request<{ question: QuestionDetail }>(`/catalog/questions/${id}`),

  submit: (questionId: string, answerText: string) =>
    request<{ submission: Submission; points: PointVerdict[] }>("/submissions", {
      method: "POST",
      body: JSON.stringify({ questionId, answerText }),
    }),

  submissionsFor: (questionId: string) =>
    request<{ submissions: Submission[] }>(
      `/submissions?questionId=${encodeURIComponent(questionId)}`
    ),

  codingQuestion: (id: string) =>
    request<{ question: CodingQuestionDetail }>(`/coding/questions/${id}`),

  runCode: (questionId: string, language: CodingLanguage, sourceCode: string) =>
    request<RunResult>("/coding/submissions", {
      method: "POST",
      body: JSON.stringify({ questionId, language, sourceCode }),
    }),

  codeSubmissionsFor: (questionId: string) =>
    request<{ submissions: CodeSubmission[] }>(
      `/coding/submissions?questionId=${encodeURIComponent(questionId)}`
    ),

  reviewCode: (submissionId: string) =>
    request<{ review: CodeReview; cached: boolean }>(
      `/coding/submissions/${submissionId}/review`,
      { method: "POST" }
    ),

  // Takes a key it ignores, to satisfy useFetch's stable-fetcher contract.
  progress: (_key: string) => request<{ progress: Progress }>("/progress"),

  assessment: (id: string) =>
    request<{ assessment: AssessmentDetail }>(`/assessments/${id}`),

  startAttempt: (assessmentId: string) =>
    request<{ attempt: Attempt; resumed: boolean }>(
      `/assessments/${assessmentId}/attempts`,
      { method: "POST" }
    ),

  saveAnswers: (attemptId: string, answers: Record<string, number>) =>
    request<{ saved: boolean }>(`/attempts/${attemptId}/answers`, {
      method: "PATCH",
      body: JSON.stringify({ answers }),
    }),

  // Answers are sent again with the submit so a selection made after the last
  // autosave cannot be lost in the gap between the two requests.
  submitAttempt: (attemptId: string, answers: Record<string, number>) =>
    request<{ result: AttemptResult }>(`/attempts/${attemptId}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),

  attemptReview: (attemptId: string) =>
    request<{ review: AttemptReview }>(`/attempts/${attemptId}/review`),

  healthFull: () =>
    request<{ backend: string; mlService: { status: string; error?: string } }>(
      "/health/full"
    ),
};
