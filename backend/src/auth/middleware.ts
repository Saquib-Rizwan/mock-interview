import { asyncHandler } from "../asyncHandler";
import { prisma } from "../prisma";
import { verifyToken } from "./jwt";

// Adds `userId` to the request once a valid token has been checked, so routes
// downstream never have to re-parse the header.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Verifies the token's signature, then confirms it has not been revoked.
 *
 * The revocation check costs one indexed primary-key lookup per authenticated
 * request, which does make auth stateful — the usual appeal of JWTs is that it
 * is not. That trade is deliberate: revocation that cannot actually revoke is
 * theatre, and a leaked token would otherwise stay usable for a full seven days.
 * Nearly every authenticated route touches the database anyway.
 *
 * It also closes a smaller hole: a deleted account's token used to keep passing
 * this middleware, and only failed later at whichever query happened to look
 * the user up.
 *
 * Wrapped in asyncHandler because this is now async, and Express 4 ignores a
 * rejected promise from middleware — a database blip would hang the request
 * rather than returning 500.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length);

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    // Covers expired, tampered and structurally invalid tokens alike. The
    // client cannot act differently on the distinction, and spelling it out
    // would tell an attacker which part of a forged token to fix.
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { tokenVersion: true },
  });

  // Same message whether the account is gone or the token was revoked: the
  // client's action is identical (sign in again), and the distinction is only
  // useful to someone probing which accounts exist.
  if (!user || user.tokenVersion !== payload.tv) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.userId = payload.userId;
  next();
});
