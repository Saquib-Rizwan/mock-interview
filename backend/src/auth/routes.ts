import bcrypt from "bcryptjs";
import { Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../prisma";
import { signToken } from "./jwt";
import { requireAuth } from "./middleware";

export const authRouter = Router();

// Cost 12 ~ 250ms per hash on typical hardware: slow enough to make offline
// brute-forcing expensive, fast enough not to stall a login.
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

// Deliberately permissive: the only reliable proof an address exists is
// sending mail to it, and over-strict patterns reject valid addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Credentials = { email: string; password: string; name?: string };

function validate(body: unknown): { data: Credentials } | { error: string } {
  const { email, password, name } = (body ?? {}) as Record<string, unknown>;

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return { error: "A valid email is required" };
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (name !== undefined && typeof name !== "string") {
    return { error: "Name must be text" };
  }

  return {
    data: {
      // Emails are stored lowercased so Foo@x.com and foo@x.com are one account.
      email: email.trim().toLowerCase(),
      password,
      name: typeof name === "string" && name.trim() ? name.trim() : undefined,
    },
  };
}

authRouter.post("/signup", asyncHandler(async (req, res) => {
  const result = validate(req.body);
  if ("error" in result) return res.status(400).json({ error: result.error });

  const { email, password, name } = result.data;

  try {
    const user = await prisma.user.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    return res.status(201).json({ token: signToken({ userId: user.id }), user });
  } catch (err) {
    // P2002 is Prisma's unique-constraint violation, i.e. the email is taken.
    // Relying on the constraint rather than a pre-check avoids a race where two
    // simultaneous signups both see the address as free.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "An account with that email already exists" });
    }
    throw err;
  }
}));

authRouter.post("/login", asyncHandler(async (req, res) => {
  const result = validate(req.body);
  if ("error" in result) return res.status(400).json({ error: result.error });

  const { email, password } = result.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Hash even when the user does not exist, so response time does not reveal
  // which emails are registered.
  const passwordOk = user
    ? await bcrypt.compare(password, user.passwordHash)
    : await bcrypt.compare(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");

  // One message for both failure modes, for the same reason.
  if (!user || !passwordOk) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  return res.json({
    token: signToken({ userId: user.id }),
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
  });
}));

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  // Token was valid but the account is gone (deleted since the token was issued).
  if (!user) return res.status(401).json({ error: "User no longer exists" });

  return res.json({ user });
}));
