// ============================================================================
// University invitation handling on the client.
//
// The token arrives in the URL FRAGMENT (/invite#<token>). Fragments are never
// sent to the server, so the token stays out of access logs. On first load we
// move it into sessionStorage and strip it from the address bar, so it does
// not sit in history. It is sent to the API only in a POST body.
//
// Both gates must be on for any of this to run:
//   - build time:  VITE_UNIVERSITY_ACCESS=true
//   - server time: features.universityAccess (UNIVERSITY_ACCESS_ENABLED=true)
// ============================================================================

export const PENDING_INVITE_KEY = "novara.pendingInvite";
const TOKEN_IN_HASH = /^#([A-Za-z0-9_-]{43})$/;

/** Build-time gate. Off unless the web build sets VITE_UNIVERSITY_ACCESS=true. */
export function universityUiEnabled(): boolean {
  return import.meta.env.VITE_UNIVERSITY_ACCESS === "true";
}

/** If the current URL carries an invite token in its fragment, takes it, stores
 *  it for this tab, and removes the fragment from the address bar. */
export function captureTokenFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const match = TOKEN_IN_HASH.exec(window.location.hash);
  if (!match) return null;
  const token = match[1]!;
  storePendingInvite(token);
  try {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  } catch {
    // Some embedded webviews refuse replaceState. The stored token still works.
  }
  return token;
}

export function storePendingInvite(token: string): void {
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    // Private mode or blocked storage. The user can reopen the link.
  }
}

export function readPendingInvite(): string | null {
  try {
    const value = sessionStorage.getItem(PENDING_INVITE_KEY);
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
