import type { NextFunction, Request, Response } from "express";
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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length);

  try {
    req.userId = verifyToken(token).userId;
    next();
  } catch {
    // Covers expired, tampered and structurally invalid tokens alike. The
    // client cannot act differently on the distinction, and spelling it out
    // would tell an attacker which part of a forged token to fix.
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
