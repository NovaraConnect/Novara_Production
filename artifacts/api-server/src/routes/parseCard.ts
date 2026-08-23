import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middlewares/auth";
import {
  isCardAiParseEnabled,
  activeCardProvider,
  parseCardText,
  cardParseLogFields,
} from "../lib/cardAiParse";

const router = Router();

// Auth-gated AND rate-limited so this can't be abused as an open LLM proxy.
const cardParseLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/parse-card-text — OCR TEXT ONLY (never the image). Best-effort:
// returns { ok:false, reason } (HTTP 200) whenever AI is disabled/unusable so
// the client silently falls back to the deterministic parser.
router.post("/parse-card-text", requireAuth, cardParseLimiter, async (req: Request, res: Response) => {
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  if (!text.trim() || text.length > 8000) {
    res.status(400).json({ error: "text is required (1..8000 chars)" });
    return;
  }

  if (!isCardAiParseEnabled()) {
    res.json({ ok: false, reason: "ai_disabled" });
    return;
  }

  const provider = activeCardProvider();
  const t0 = Date.now();
  const result = await parseCardText(text); // best-effort, never throws
  const ms = Date.now() - t0;

  // METADATA ONLY — never the OCR text or the parsed fields.
  console.log("[card-parse]", JSON.stringify(cardParseLogFields(text, result, ms, provider)));

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
