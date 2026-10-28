// ============================================================================
// Public feature-flag surface. Lets the frontend discover which optional
// capabilities are available in this deployment so it can hide or disable UI
// for anything not configured. Returns booleans only — no secrets.
// ============================================================================
import { Router, type Request, type Response } from "express";
import { isAiEnrichEnabled } from "../lib/enrich";
import { isCardAiParseEnabled } from "../lib/cardAiParse";
import { isLinkedInAiParseEnabled } from "../lib/linkedinAiParse";
import { isPaywallEnabled } from "../lib/entitlements";
import { isLocalStoreKitTestEnabled } from "./storekitTest";

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
    // Shows the native Novara Pro paywall (iOS shell only). Off by default: it
    // must stay off until the App Store products, the RevenueCat webhook and a
    // TestFlight build with the purchase bridge are all live.
    applePaywall: isPaywallEnabled(),
    // Adding contacts needs Novara Pro or its free trial; there is no free
    // plan. Always true. Kept so app builds already in people's hands, which
    // read it, show the subscription screen.
    subscriptionRequired: true,
    // Local development only: the iOS "StoreKit Test" scheme reports simulator
    // purchases to /api/dev/storekit-test/entitlement. Always false on Render.
    localStoreKitTest: isLocalStoreKitTestEnabled(),
  });
});

export default router;
