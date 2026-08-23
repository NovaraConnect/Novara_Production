// ============================================================================
// Public feature-flag surface. Lets the frontend discover which optional
// capabilities are available in this deployment so it can hide or disable UI
// for anything not configured. Returns booleans only — no secrets.
// ============================================================================
import { Router, type Request, type Response } from "express";
import { isAiEnrichEnabled } from "../lib/enrich";
import { isCardAiParseEnabled } from "../lib/cardAiParse";

const router = Router();

// GET /api/features — unauthenticated, non-secret capability flags.
router.get("/features", (_req: Request, res: Response) => {
  res.json({
    aiEnrich: isAiEnrichEnabled(),
    cardAiParse: isCardAiParseEnabled(),
  });
});

export default router;
