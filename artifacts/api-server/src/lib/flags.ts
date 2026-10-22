// ============================================================================
// University access feature flag.
//
// Read at request time, not at import, so tests can toggle it and so a
// restart is the only thing needed to flip it in production. Strict: only the
// exact string "true" enables the feature. Anything else (unset, "1", "yes")
// is off, because this gate controls an unreleased access path.
// ============================================================================

export function universityAccessEnabled(): boolean {
  return process.env["UNIVERSITY_ACCESS_ENABLED"] === "true";
}
