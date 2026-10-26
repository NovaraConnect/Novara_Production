// GET /api/entitlements/me — the signed-in user's Pro status, as the server
// sees it. The app uses this to decide what to show. It is advisory for UI
// only; limits are enforced server-side on every write regardless.
import { Router, type Request, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { proStatusFor } from "../lib/entitlements";
import { logger } from "../lib/logger";

const router = Router();

router.get("/entitlements/me", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  try {
    res.json(await proStatusFor(userId));
  } catch (err) {
    logger.error({ err }, "entitlement lookup failed");
    res.status(500).json({ error: "Could not read subscription status" });
  }
});

export default router;
