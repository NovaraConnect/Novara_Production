# Novara — Screen Inventory

Each entry lists: route, data dependencies, what the screen renders, and what the user can do.

---

## 1. Home / Landing (public)

**Route:** `/` (web) → `(auth)/index` or a dedicated splash screen in RN  
**Auth required:** No  
**Data fetched:** None  
**Renders:**
- App logo + tagline
- Feature highlights (relationship health score, smart cadence, AI priorities)
- Target audience callouts (MBA students, job seekers, networkers)
- CTA buttons: Sign Up, Sign In, Try Demo

**User actions:**
- Navigate to Sign Up
- Navigate to Sign In
- Navigate to Demo (unauthenticated preview)

---

## 2. Sign In

**Route:** `/sign-in` → `(auth)/sign-in`  
**Auth required:** No  
**Data fetched:** None (handled by Clerk)  
**Renders:**
- Clerk `<SignIn />` component (email/password + OAuth)

**User actions:**
- Sign in with email + password
- Sign in with OAuth (Google, etc.)
- Navigate to Sign Up

---

## 3. Sign Up

**Route:** `/sign-up` → `(auth)/sign-up`  
**Auth required:** No  
**Data fetched:** None (handled by Clerk)  
**Renders:**
- Clerk `<SignUp />` component

**User actions:**
- Create account
- Navigate to Sign In

---

## 4. Dashboard

**Route:** `/dashboard` → `(app)/dashboard`  
**Auth required:** Yes  
**Data fetched:** `useContacts()`, `useSettings()`  
**Renders:**
- Relationship health score (0–100, computed from contact freshness)
- Stats row: total contacts, hot this week, overdue count
- Maintenance mode notice (if any contacts in maintenance)
- "Needs Attention" list — contacts sorted by urgency (overdue first, then upcoming)
- Onboarding tour overlay (first-time users only, `hasSeenTutorial === false`)

**User actions:**
- Tap a contact → navigate to Contact Detail
- Tap "Add Contact" FAB → navigate to Add Contact
- Complete/dismiss onboarding tour (marks `hasSeenTutorial = true` via settings PUT)

---

## 5. Contacts

**Route:** `/contacts` → `(app)/contacts`  
**Auth required:** Yes  
**Data fetched:** `useContacts()`  
**Renders:**
- Search bar (client-side filter on name, company, role)
- Tabs: Connected | Pipeline (by `connectionStatus`)
- Sub-tabs: Warm | Cooling | Cold (by last interaction recency)
- Scrollable list of `ContactCard` items

**User actions:**
- Type to search/filter contacts
- Switch status tabs
- Switch temperature tabs
- Tap a contact → navigate to Contact Detail

---

## 6. Contact Detail

**Route:** `/contacts/:id` → `(app)/contacts/[id]`  
**Auth required:** Yes  
**Data fetched:** `useContacts()`, `useSettings()`, `useCompanyNews(contact.company)`  
**Renders:**
- Contact header: name, role, company, importance badge, priority badge
- Relationship section: days since last contact, next follow-up date, cadence label
- Goal tags matched to contact
- Company news headlines (from `/api/company-news`, 6-hour cache)
- Notes field (read-only view; edit on EditContact screen)
- LinkedIn URL link
- Calendar event suggestion

**User actions:**
- "Contacted Today" button → `markContactedToday` mutation
- Delete contact → confirmation alert → `removeContact` mutation, navigate back
- Edit → navigate to Edit Contact
- Open LinkedIn profile (deep link)
- Toggle push notification for this contact

---

## 7. Add Contact

**Route:** `/add` → `(app)/add`  
**Auth required:** Yes  
**Data fetched:** `useContacts()` (for limit check), `useSettings()` (for AI suggestions)  
**Renders:**
- Two scanner options (Business Card OCR, QR/vCard reader) — may require native camera permissions
- Contact form with Quick fields (firstName, lastName, company, importance, connectionStatus, initialFollowUpDays, followUpCadenceDays) and optional Detail fields (role, metAt, linkedinUrl, email, phone, industry, function, notes)
- AI-suggestion banner auto-applies importance and timing defaults based on role/company vs career goals
- "AI selected" pill tags on timing fields when AI has suggested a value

**User actions:**
- Scan business card (camera) → auto-fill form
- Scan QR/vCard (camera) → auto-fill form
- Import from LinkedIn URL → auto-fill form
- Fill and submit form → `addContact` mutation
- Override any AI suggestion manually

---

## 8. Edit Contact

**Route:** `/contacts/:id/edit` → `(app)/contacts/[id]/edit`  
**Auth required:** Yes  
**Data fetched:** `useContacts()`  
**Renders:**
- Same form as Add Contact, pre-populated with existing contact data
- Priority override toggle (manual override locks AI recalc)
- Interest tag manager (add/remove free-text tags)
- AI re-suggest button for timing fields

**User actions:**
- Edit any contact field
- Toggle priority override
- Add/remove interest tags
- Save → `updateContact` mutation, navigate back

---

## 9. Settings

**Route:** `/settings` → `(app)/settings`  
**Auth required:** Yes  
**Data fetched:** `useSettings()`  
**Renders:**
- Account info (name, email, avatar from Clerk)
- Career statement textarea
- Goal tags (add/remove short tags like "VC", "McKinsey")
- Career goals list (full sentences, used for AI priority matching)
- Auto-downgrade setting (3 / 6 / 9 / 12 months)
- "Replay Tutorial" button
- Sign Out button

**User actions:**
- Edit and save career statement → `updateSettings({ careerStatement, goalTags })`
- Add / remove career goals → `updateSettings({ careerGoals })`
- Add / remove goal tags → `updateSettings({ goalTags })`
- Change auto-downgrade period → `updateSettings({ autoDowngradeAfterMonths })`
- Replay onboarding tour
- Sign out

---

## 10. Notifications

**Route:** `/notifications` → `(app)/notifications`  
**Auth required:** Yes  
**Data fetched:** Push subscription state (custom hook, no TanStack Query)  
**Renders:**
- Master push notifications toggle
- Per-type toggles: follow-up reminders, overdue alerts, weekly digest
- Digest timing picker

**User actions:**
- Enable / disable push notifications (requests OS permission on first enable)
- Toggle individual notification types
- Set digest delivery time

---

## 11. Demo / Try (public preview)

**Route:** `/demo`, `/try` → `(public)/demo`  
**Auth required:** No  
**Data fetched:** None (uses hardcoded mock contacts)  
**Renders:**
- Read-only dashboard with sample data to show app capabilities
- CTA to sign up

**User actions:**
- View mock contacts
- Navigate to sign up
