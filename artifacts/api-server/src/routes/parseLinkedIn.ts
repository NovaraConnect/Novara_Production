import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middlewares/auth";
import {
  isLinkedInAiParseEnabled,
  activeLinkedInProvider,
  parseLinkedInText,
  linkedinParseLogFields,
} from "../lib/linkedinAiParse";

const router = Router();

// Auth-gated AND rate-limited so this can't be abused as an open LLM proxy.
const linkedinParseLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/parse-linkedin-text — OCR TEXT ONLY (never the screenshot). The
// text comes from on-device OCR of an image the user chose; this server never
// contacts LinkedIn. Best-effort: returns { ok:false, reason } (HTTP 200)
// whenever AI is disabled/unusable so the client silently falls back to the
// deterministic parser.
router.post("/parse-linkedin-text", requireAuth, linkedinParseLimiter, async (req: Request, res: Response) => {
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  if (!text.trim() || text.length > 8000) {
    res.status(400).json({ error: "text is required (1..8000 chars)" });
    return;
  }

  if (!isLinkedInAiParseEnabled()) {
    res.json({ ok: false, reason: "ai_disabled" });
    return;
  }

  const provider = activeLinkedInProvider();
  const t0 = Date.now();
  const result = await parseLinkedInText(text); // best-effort, never throws
  const ms = Date.now() - t0;

  // METADATA ONLY — never the OCR text or the parsed fields (name, company,
  // role, location, profile URL all stay out of the logs).
  console.log("[linkedin-parse]", JSON.stringify(linkedinParseLogFields(text, result, ms, provider)));

  if (!result) {
    res.json({ ok: false, reason: "ai_error" });
    return;
  }

  res.json({
    ok: true,
    provider,
    fields: result.fields,
    confidence: result.confidence,
    warnings: result.warnings,
  });
});

export default router;
