import jwt from "jsonwebtoken";

// Fail loudly at startup rather than signing tokens with `undefined`, which
// would produce tokens any attacker could forge.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Copy backend/.env.example to backend/.env and set it."
  );
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";

/**
 * `tv` is the User.tokenVersion this token was signed with. The auth middleware
 * compares it against the stored value on every request, so incrementing the
 * stored version invalidates every token issued before it.
 *
 * Kept short because it rides on every request.
 */
export type TokenPayload = { userId: string; tv: number };

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, JWT_SECRET as string) as Partial<TokenPayload>;

  // Tokens issued before revocation existed have no `tv`. Rejecting them rather
  // than defaulting to 0 means the deploy that adds this feature also signs
  // everyone out — which is the correct, conservative behaviour for a change
  // whose entire purpose is being able to invalidate tokens.
  if (typeof payload.userId !== "string" || typeof payload.tv !== "number") {
    throw new Error("Token is missing required claims");
  }

  return { userId: payload.userId, tv: payload.tv };
}
