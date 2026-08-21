import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";

const app: Express = express();

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

const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://novara-mobile2-frontend.onrender.com";
const ALLOWED_ORIGINS = new Set([
  FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  ]);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
  }),
  );

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// General rate limit for the whole API surface. This is a first line of
// defense while the unauthenticated proxy endpoints (news, LinkedIn import)
// remain the most exposed to abuse.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

app.use(
  clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    authorizedParties: [FRONTEND_URL],
  }),
  );

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

export default app;
