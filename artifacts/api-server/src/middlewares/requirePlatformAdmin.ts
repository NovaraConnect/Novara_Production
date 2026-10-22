import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "./auth";

/** Platform staff only. Comma-separated Clerk user IDs in PLATFORM_ADMIN_USER_IDS.
 *  Non-admins get 404 so the admin surface is not discoverable. Must run after requireAuth. */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  const allowed = (process.env["PLATFORM_ADMIN_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const userId = (req as AuthedRequest).userId;
  if (!userId || !allowed.includes(userId)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}
