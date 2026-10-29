import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "./auth";
import { isSubscriptionRequired, limitReachedBody, proStatusFor } from "../lib/entitlements";
import { logger } from "../lib/logger";

/**
 * Refuses the request unless the user has Pro or a trial, while a subscription
 * is required (lib/entitlements.ts). Mount after requireAuth.
 *
 * The web app already shows the subscription screen in place of the app, but
 * that is UI only: this is what stops the API itself being used for free, and
 * the paid AI calls behind it being run for someone who hasn't paid.
 *
 * Deliberately NOT mounted on: listing contacts (Settings' export uses it, so
 * a lapsed user can still take their data), deleting a contact or its photo,
 * deleting the account, settings, notifications, and the entitlement and
 * webhook routes.
 */
export const requireSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!isSubscriptionRequired()) {
    next();
    return;
  }
  const userId = (req as AuthedRequest).userId;
  try {
    if ((await proStatusFor(userId)).pro) {
      next();
      return;
    }
  } catch (err) {
    logger.error({ err, path: req.path }, "subscription check failed");
    res.status(503).json({ error: "Could not check your subscription. Please try again." });
    return;
  }
  res.status(403).json(limitReachedBody());
};
