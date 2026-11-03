import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { allowedOrigins, frontendOrigins } from "./lib/frontendOrigins";
import { startScheduler } from "./lib/scheduler";
import { startHealthSnapshotScheduler } from "./lib/networkHealth";

const app: Express = express();

// Render sits in front of the API, so the client address is in
// X-Forwarded-For. Without this every request looks like it comes from the
// proxy and all users share one rate-limit bucket.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
  );

// Security headers. CSP is left disabled for now because Clerk's hosted
// scripts and frames need a carefully tuned policy; the other protections
// (HSTS, X-Content-Type-Options, frameguard, etc.) are safe defaults.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// The main web app, plus the Android app's own copy when ANDROID_FRONTEND_URL
// is set. See lib/frontendOrigins.ts.
const FRONTEND_ORIGINS = frontendOrigins(process.env);
const ALLOWED_ORIGINS = allowedOrigins(process.env);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }
      // No CORS headers, so the browser blocks it; not a server error.
      callback(null, false);
    },
    // Let browsers reuse a preflight for two hours (Chromium's ceiling), so a
    // cross-origin API call doesn't mean two round trips each time.
    maxAge: 7200,
  }),
  );

// 300 KB: room for a contact photo (the app sends at most ~200 KB as base64).
app.use(express.json({ limit: "300kb" }));
app.use(express.urlencoded({ extended: true }));

// First line of defense, per IP address. High enough for a campus sharing one
// address: the per-account limit further down is what holds signed-in users.
//
// The RevenueCat webhook is exempt: RevenueCat delivers subscription events in
// bursts, and a 429 would only make it retry. It authenticates itself with a
// shared secret instead (routes/revenuecat.ts).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/webhooks/revenuecat",
});
app.use("/api", apiLimiter);

app.use(
  clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    authorizedParties: FRONTEND_ORIGINS,
  }),
  );

function signedInUser(req: Request): string | null {
  try {
    return getAuth(req)?.userId ?? null;
  } catch {
    return null;
  }
}

// Per account, once Clerk has identified the caller. In memory, so each API
// instance counts separately; a database write on every request would cost more
// than the abuse it stops. The expensive actions are counted in Postgres instead.
const accountLimiter = rateLimit({
  windowMs: 60_000,
  limit: () => Number(process.env.ACCOUNT_REQUESTS_PER_MINUTE) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !signedInUser(req),
  keyGenerator: (req) => signedInUser(req) as string,
  message: { error: "Too many requests. Please slow down.", code: "ACCOUNT_RATE_LIMIT" },
});
app.use("/api", accountLimiter);

app.use("/api", router);

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

startScheduler();
startHealthSnapshotScheduler();

export default app;
