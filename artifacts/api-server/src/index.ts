import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "./db";
import { shutdownApns } from "./lib/apns";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Render sends SIGTERM before replacing an instance on deploy. Let requests in
// flight finish, then close the database pool and the APNs connection.
process.once("SIGTERM", () => {
  logger.info("SIGTERM received; shutting down");
  server.close(() => {
    void Promise.allSettled([pool.end(), shutdownApns()]).then(() => process.exit(0));
  });
  // Don't outlive Render's grace period on a hung connection.
  setTimeout(() => process.exit(0), 25_000).unref();
});
