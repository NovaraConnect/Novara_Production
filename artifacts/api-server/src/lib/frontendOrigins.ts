// ============================================================================
// Which web origins may call the API (CORS) and present Clerk session tokens
// (authorizedParties).
//
// FRONTEND_URL is the main web app, which the iOS app also loads.
// ANDROID_FRONTEND_URL is the separate copy of the web app that only the
// Android app loads (android.novaraconnect.group, deployed from feat/android).
// It is optional: unset or blank, the list is exactly what it was before
// Android existed.
// ============================================================================

export const DEFAULT_FRONTEND_URL = "https://novara-mobile2-frontend.onrender.com";

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

/** The deployed web apps whose Clerk tokens the API accepts. */
export function frontendOrigins(env: Record<string, string | undefined>): string[] {
  const origins = [env["FRONTEND_URL"] ?? DEFAULT_FRONTEND_URL];
  const android = env["ANDROID_FRONTEND_URL"]?.trim();
  if (android && !origins.includes(android)) origins.push(android);
  return origins;
}

/** Every origin CORS lets through: the deployed web apps plus local dev. */
export function allowedOrigins(env: Record<string, string | undefined>): Set<string> {
  return new Set([...frontendOrigins(env), ...LOCAL_DEV_ORIGINS]);
}
