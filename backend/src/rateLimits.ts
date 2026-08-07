import rateLimit from "express-rate-limit";
import type { Request } from "express";

/**
 * Rate limiters, one per thing worth protecting.
 *
 * Three separate limits rather than one global one, because the resources being
 * protected fail in different ways and at different scales: guessing a password
 * costs us nothing but costs the user their account, whereas a code submission
 * costs real CPU on a two-core box and an LLM call costs quota that runs out.
 *
 * NEW DEPENDENCY: express-rate-limit. Chosen as the de facto standard for
 * Express with no transitive baggage.
 *
 * KNOWN LIMITATION: the default store is in-memory, so counters live in one
 * process. Running two backend instances behind a load balancer would give each
 * its own counters and effectively double every limit. Fixing that needs a
 * shared store (Redis); deferred and documented rather than built, since the
 * current deployment is a single instance.
 */

/** Authenticated routes key by user, so one user cannot spend another's budget. */
function keyByUser(req: Request): string {
  return req.userId ?? req.ip ?? "unknown";
}

const jsonMessage = (error: string) => ({ error });

/**
 * Login and signup. Keyed by IP because there is no authenticated user yet.
 *
 * `skipSuccessfulRequests` means a person who keeps typing their password
 * correctly is never locked out — only repeated *failures* count, which is what
 * brute-forcing looks like.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage("Too many attempts. Please wait a few minutes and try again."),
});

/**
 * Code execution. The Judge0 box has two cores and compiles C++ and Java from
 * cold; a student holding down Run would starve everyone else on the platform.
 */
export const executionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: keyByUser,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage(
    "You're running code very frequently. Please wait a few minutes before trying again."
  ),
});

/**
 * Anything that calls the language model — answer grading and code review.
 * This one protects a quota that costs money and simply stops when exhausted,
 * so it is the tightest of the three.
 */
export const llmLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  keyGenerator: keyByUser,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage(
    "You've submitted a lot of answers in a short time. Please wait a few minutes."
  ),
});
