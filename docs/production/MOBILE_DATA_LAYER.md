# Mobile Data Layer — Contact Type ↔ Backend DTO Mapping

Reference before/while wiring the Expo app to the authenticated backend. The
backend response DTO (`dbToContact` in `api-server/src/db.ts`) is **identical**
to the web app's `Contact` type — that is the canonical shape.

## Field-by-field mapping (backend DTO → mobile `Contact`)

| Backend DTO field | Mobile `Contact` | Mapping / decision |
|---|---|---|
| `id` | `id` | pass-through |
| `firstName`,`lastName` | same | pass-through |
| `linkedinUrl`,`email`,`phone` | same (optional) | pass-through |
| `company` | `company` | pass-through |
| `role`,`metAt`,`notes` | same (optional) | pass-through |
| `importance` (= base priority) | `importance` | **mobile shows/edits BASE priority** (the user's chosen value), mapped from `importance`. See note 1. |
| `basePriority` | — | dropped (same value as `importance`) |
| `currentPriority` | — | **dropped** — backend-computed effective priority is not surfaced in mobile (single-badge UI). Note 1. |
| `priorityOverride` | — | dropped (mobile has no override UI) |
| `industry`,`function`,`interests` | — | dropped (mobile has no inputs for these; backend defaults them) |
| `initialFollowUpDays` | `initialFollowUpDays` | pass-through; **type widened to `number`** (note 2) |
| `followUpCadenceDays` | `followUpCadenceDays` | pass-through; **type widened to `number`** (note 2) |
| `cadenceOverride` | — | dropped |
| `goalTags` | `goalTags` | pass-through (`?? []`) |
| `connectionStatus` | `connectionStatus` | pass-through (`"connected"\|"pipeline"`) |
| `firstContactDate` | — | dropped (mobile never reads it) |
| `lastInteractionDate` | `lastInteractionDate` | pass-through; **format differs** (note 3) |
| `nextFollowUpDate` | `nextFollowUpDate` | pass-through; format differs (note 3) |
| `createdAt` | `createdAt` | pass-through (ISO datetime, matches) |

Verified: the mobile app **reads none of** the dropped fields (`basePriority`,
`currentPriority`, `priorityOverride`, `industry`, `function`, `interests`,
`cadenceOverride`, `firstContactDate`) — grep shows 0 usages — so dropping them
is safe and lossless for the mobile UI.

## Mismatches found and how they are fixed

**Note 1 — one priority field vs two.** The backend has `basePriority` (user's
choice) and `currentPriority` (recomputed effective). Mobile has a single
`importance`. Decision: map `importance ← DTO.importance` (= base) so editing a
contact round-trips the user's own value without drift. Consequence: mobile does
not display the backend's recomputed `currentPriority`. Documented, intentional.

**Note 2 — numeric union vs integer.** Mobile typed `initialFollowUpDays` as
`1|2|3|5|7|14` and `followUpCadenceDays` as `14|21|30|42|60|90|180`, but the
backend returns/stores arbitrary integers (e.g. cadence derived from priority).
Fix: **widen both mobile fields to `number`** in `types/contact.ts`. The add/edit
screens keep their option arrays as UI choices (still valid `number[]`).

**Note 3 — date format.** Local AsyncStorage stored `lastInteractionDate` /
`nextFollowUpDate` as ISO datetimes (`toISOString()`); the backend returns
date-only `YYYY-MM-DD`. Mobile date logic uses `new Date(str)`, which parses both,
so this is compatible. Once backend-backed, the backend's dates are authoritative
and any mobile-side date computation on save is superseded by the server response.

## Request shapes (mirrors the web app's `lib/api.ts`)
- `GET  /api/contacts` → `ApiContact[]`
- `POST /api/contacts` body = create fields (camelCase, names already match mobile) → `ApiContact`
- `PUT  /api/contacts/:id` body = `Partial` of the same fields → `ApiContact`
- `DELETE /api/contacts/:id`
- `POST /api/contacts/:id/mark-contacted` → `ApiContact`
- `POST /api/contacts/import` body = `{ contacts: [...] }` (accepts the mobile shape) → `{ imported, skipped }`
- `GET/PUT /api/settings` for profile (careerStatement, goalTags)

All calls attach `Authorization: Bearer <token>` via `authedFetch(getToken, …)`.
