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

export type TokenPayload = { userId: string };

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET as string) as TokenPayload;
}
