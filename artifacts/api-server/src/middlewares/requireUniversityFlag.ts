import type { Request, Response, NextFunction } from "express";
import { universityAccessEnabled } from "../lib/flags";

/**
 * Returns 404 (not 403) while the feature is off, so an unreleased route is
 * indistinguishable from a route that does not exist. Must run before
 * requireAuth on every university route.
 */
export function requireUniversityFlag(_req: Request, res: Response, next: NextFunction): void {
  if (!universityAccessEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}
