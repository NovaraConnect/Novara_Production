// Shared helper for backend tests: imports the real Express app (same one
// index.ts serves in production) and provides small helpers for setting the
// mocked test-auth headers registered in setup.ts.
import app from "../src/app";

export { app };

export function authHeaders(userId: string): Record<string, string> {
  return { "x-test-user-id": userId };
}

export function forcedAuthErrorHeaders(): Record<string, string> {
  return { "x-test-force-auth-error": "1" };
}

/** Registers the Clerk user the mocked clerkClient will return for `userId`. */
export function setTestClerkUser(
  userId: string,
  opts: { email: string; verified?: boolean },
): void {
  const map = (globalThis as { __novaraTestClerkUsers?: Map<string, unknown> }).__novaraTestClerkUsers;
  if (!map) throw new Error("test Clerk map not initialised (setup.ts)");
  map.set(userId, {
    primaryEmailAddress: {
      emailAddress: opts.email,
      verification: { status: opts.verified === false ? "unverified" : "verified" },
    },
  });
}
