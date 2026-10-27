import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { recordHealthSnapshots, scoreAMonthAgo } from "../lib/networkHealth";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/network-health/trend
// Records today's score for the caller, then returns the score from about a
// month ago (or null while there is not yet a month of history). The app
// compares it with the score it shows.
router.get("/network-health/trend", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  try {
    await recordHealthSnapshots(userId);
    res.json({ lastMonth: await scoreAMonthAgo(userId) });
  } catch (err) {
    logger.error({ err }, "Network Health trend failed");
    res.status(500).json({ error: "Failed to load Network Health trend" });
  }
});

export default router;
