import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 ignores rejected promises from async handlers: the error never
// reaches the error middleware and the request hangs until it times out.
// Wrapping forwards rejections to next() so the error handler sees them.
// (Express 5 does this natively; this becomes removable on upgrade.)
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
