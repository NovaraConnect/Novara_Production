// ============================================================================
// Public feature-flag surface. Lets the frontend discover which optional
// capabilities are available in this deployment so it can hide or disable UI
// for anything not configured. Returns booleans only — no secrets.
// ============================================================================
import { Router, type Request, type Response } from "express";
import { isAiEnrichEnabled } from "../lib/enrich";
import { isCardAiParseEnabled } from "../lib/cardAiParse";
import { isLinkedInAiParseEnabled } from "../lib/linkedinAiParse";

function flagOn(v: string | undefined): boolean {
  return !!v && ["1", "true", "on", "yes"].includes(v.trim().toLowerCase());
}

const router = Router();

// GET /api/features — unauthenticated, non-secret capability flags.
router.get("/features", (_req: Request, res: Response) => {
  res.json({
    aiEnrich: isAiEnrichEnabled(),
    cardAiParse: isCardAiParseEnabled(),
    linkedinAiParse: isLinkedInAiParseEnabled(),
    // UI visibility for the LinkedIn screenshot importer. Off unless explicitly
    // enabled, and independent of linkedinAiParse: the importer can be shown
    // with AI off (deterministic parsing only), or hidden entirely.
    linkedinScreenshotImport: flagOn(process.env["LINKEDIN_SCREENSHOT_IMPORT"]),
  });
});

export default router;
