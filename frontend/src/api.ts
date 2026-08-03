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

export type QuestionCategory =
  | "company_specific"
  | "os"
  | "cn"
  | "dbms"
  | "dsa"
  | "general_hr"
  | "other";

export type Difficulty = "easy" | "medium" | "hard";

export type CompanySummary = { id: string; name: string; roleCount: number };
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
};

export type RoleDetail = {
  id: string;
  name: string;
  company: { id: string; name: string };
  rounds: RoundSummary[];
};

// expectedAnswerPoints is intentionally absent — the server does not send it.
export type QuestionSummary = {
  id: string;
  text: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  questionType: "text" | "coding";
};

export type QuestionDetail = {
  id: string;
  text: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  questionType: "text" | "coding";
  // How many criteria the answer is graded against. The criteria themselves
  // stay on the server.
  expectedPointCount: number;
};

export type PointVerdict = { point: string; covered: boolean; comment: string };

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

  healthFull: () =>
    request<{ backend: string; mlService: { status: string; error?: string } }>(
      "/health/full"
    ),
};
