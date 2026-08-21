// ── Cadence ───────────────────────────────────────────────────────────────────

export const MAINTENANCE_DAYS = 180;

export const INITIAL_FOLLOWUP_OPTIONS = [1, 2, 3, 5, 7, 14] as const;

export const CADENCE_OPTIONS = [14, 30, 60, 90] as const;

export const AUTO_DOWNGRADE_OPTIONS = [3, 6, 9, 12] as const;

// ── Cadence labels ────────────────────────────────────────────────────────────

export function labelDays(days: number): string {
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  if (days === 14) return "2 weeks";
  if (days === 30) return "1 month";
  if (days === 60) return "2 months";
  if (days === 90) return "3 months";
  if (days === MAINTENANCE_DAYS) return "6 months (maintenance)";
  return `${days} days`;
}

export function formatCadenceLabel(followUpCadenceDays: number, isMaintenance: boolean): string {
  if (isMaintenance) return "Maintenance: twice per year";
  if (followUpCadenceDays === 14) return "Every 2 weeks";
  if (followUpCadenceDays === 30) return "Every month";
  if (followUpCadenceDays === 60) return "Every 2 months";
  if (followUpCadenceDays === 90) return "Every 3 months";
  return `Every ${followUpCadenceDays} days`;
}

// ── Priority / Importance ─────────────────────────────────────────────────────

export const PRIORITY_LEVELS = ["High", "Medium", "Low"] as const;

export const IMPORTANCE_LEVELS = ["High", "Medium", "Low"] as const;

// ── AI suggestion heuristics ──────────────────────────────────────────────────

export const GENERIC_HIGH_ROLES = [
  "recruiter", "recruiting", "talent",
  "vp", "vice president", "svp", "evp",
  "director", "managing director", "md",
  "partner", "managing partner",
  "ceo", "cto", "coo", "cfo", "chief",
  "president", "founder", "co-founder",
  "principal", "general partner", "gp",
];

export const GENERIC_HIGH_COMPANIES = [
  "google", "meta", "apple", "microsoft", "amazon", "netflix",
  "mckinsey", "bain", "bcg", "oliver wyman", "deloitte", "accenture",
  "goldman sachs", "morgan stanley", "jpmorgan", "blackstone", "kkr", "blackrock",
  "sequoia", "a16z", "andreessen horowitz", "benchmark", "greylock",
  "openai", "anthropic", "stripe", "airbnb", "uber", "lyft", "doordash",
  "harvard", "stanford", "wharton", "mit sloan",
];

export const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "through", "during",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might",
  "i", "my", "me", "we", "our", "you", "your", "he", "she", "they", "it",
  "this", "that", "these", "those", "am", "work", "working",
]);

// ── Relationship status ───────────────────────────────────────────────────────

export const CONNECTION_STATUSES = ["connected", "pipeline"] as const;

// ── Brand colors ──────────────────────────────────────────────────────────────

export const colors = {
  primary: "#2941a3",
  primaryDark: "#1e3fa3",
  text: "#161d2e",
  textMuted: "#6b7280",
  border: "#d9dce6",
  background: "#ffffff",
  backgroundAlt: "#f9fafb",
  danger: "#ef4444",
  success: "#10b981",
  warning: "#f59e0b",
  radius: 12,

  priority: {
    High: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
    Medium: { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
    Low: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
  },

  status: {
    warm: { bg: "#fef3c7", text: "#d97706" },
    cooling: { bg: "#fff7ed", text: "#ea580c" },
    cold: { bg: "#fee2e2", text: "#dc2626" },
    connected: { bg: "#dbeafe", text: "#1d4ed8" },
    pipeline: { bg: "#f3e8ff", text: "#7c3aed" },
  },
} as const;

// ── Free tier ─────────────────────────────────────────────────────────────────

export const FREE_TIER_CONTACT_LIMIT = 25;

// ── Async storage keys ────────────────────────────────────────────────────────
// Use with @react-native-async-storage/async-storage

export const STORAGE_KEYS = {
  CONTACTS: "novara_contacts",
  PROFILE: "novara_profile",
  DIGEST_ENABLED: "novara_digest_enabled",
  DIGEST_TIME: "novara_digest_time",
} as const;
