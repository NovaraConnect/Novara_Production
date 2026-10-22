// ============================================================================
// Invitation tokens and email normalization.
//
// Tokens are 32 random bytes, base64url encoded (43 characters). Only the
// SHA-256 hash is stored. A raw token leaves the server exactly twice: inside
// the invite link returned to the admin, and inside the invitation email.
// ============================================================================
import { createHash, randomBytes } from "node:crypto";

export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const MAX_EMAIL_LENGTH = 254;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createInviteToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Cheap shape check before touching the database. Rejects junk early. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** Trims and lowercases. Returns null when the value is not a plausible address. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_PATTERN.test(email) ? email : null;
}

/** "jane.doe@school.edu" -> "j***@school.edu". For display only. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export function inviteBaseUrl(): string {
  return (process.env["INVITE_BASE_URL"] ?? "https://app.novaraconnect.group").replace(/\/+$/, "");
}

/**
 * The token goes in the URL FRAGMENT. Fragments are never sent to the server,
 * so the token stays out of access logs and CDN logs. The client reads it from
 * window.location.hash and posts it to the API in a request body.
 */
export function inviteUrlFor(raw: string): string {
  return `${inviteBaseUrl()}/invite#${raw}`;
}
