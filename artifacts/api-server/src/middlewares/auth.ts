import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export interface AuthedRequest extends Request {
    userId: string;
}

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    let userId: string | null | undefined;

    try {
          const auth = getAuth(req);
          userId =
                  auth && typeof auth === "object" && typeof (auth as { userId?: unknown }).userId === "string"
              ? (auth as { userId: string }).userId
                    : undefined;
    } catch (err) {
          logger.warn({ err, path: req.path, method: req.method }, "Clerk authentication failed");
          res.status(401).json({ error: "Unauthorized" });
          return;
    }

    if (!userId) {
          logger.warn({ path: req.path, method: req.method }, "Request missing authenticated user");
          res.status(401).json({ error: "Unauthorized" });
          return;
    }

    (req as AuthedRequest).userId = userId;
    next();
};
