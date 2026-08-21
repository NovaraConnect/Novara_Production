# Novara — Reusable Component Inventory

Each component entry lists its props, behavior, and React Native rebuild notes.

---

## 1. ContactCard

**Purpose:** Summary card shown in the Contacts list and Dashboard "Needs Attention" section.

**Props:**
```typescript
interface ContactCardProps {
  contact: Contact;
}
```

**Behavior:**
- Displays: full name, company, role (if present), importance badge, relationship status badge, days until / since last interaction
- Color-codes urgency: green (warm, >50% of cadence remaining), amber (cooling, 10–50% remaining), red (cold / overdue)
- Shows company news indicator for cold contacts
- Tappable — navigates to ContactDetail

**React Native rebuild:**
- Use `TouchableOpacity` or `Pressable` wrapping a `View`
- Replace CSS color classes with `StyleSheet` colors from `constants.ts`
- Use `useNavigation().navigate("ContactDetail", { id: contact.id })`

---

## 2. ImportanceBadge

**Purpose:** Color pill showing High / Medium / Low importance.

**Props:**
```typescript
interface ImportanceBadgeProps {
  importance: "High" | "Medium" | "Low";
  size?: "sm" | "md";
}
```

**Behavior:**
- High → red background, dark red text
- Medium → amber background, dark amber text
- Low → green background, dark green text

**React Native rebuild:**
```typescript
const priorityColors = {
  High: { bg: "#fef2f2", text: "#991b1b" },
  Medium: { bg: "#fffbeb", text: "#92400e" },
  Low: { bg: "#f0fdf4", text: "#166534" },
};
// Render as <View style={{ backgroundColor, borderRadius: 9999, paddingHorizontal: 8 }}>
//             <Text style={{ color: text }}>{importance}</Text>
//           </View>
```

---

## 3. StatusBadge

**Purpose:** Shows relationship "temperature" — Warm, Cooling, or Cold — based on last interaction date vs. cadence.

**Props:**
```typescript
interface StatusBadgeProps {
  contact: Contact;
  settings: UserSettings;
}
```

**Behavior:**
- Computes `daysSinceLast` and `effectiveCadence` (uses `getEffectiveCadenceDays` from cadence logic)
- Warm: `daysSinceLast < effectiveCadence * 0.5`
- Cooling: `daysSinceLast < effectiveCadence`
- Cold / Overdue: `daysSinceLast >= effectiveCadence`

**React Native rebuild:**
- Pure computation + colored pill View/Text — no web dependencies

---

## 4. BusinessCardScanner

**Purpose:** Camera + OCR to auto-fill the Add Contact form from a physical business card.

**Props:**
```typescript
interface BusinessCardScannerProps {
  onExtracted: (data: Partial<{
    firstName: string;
    lastName: string;
    company: string;
    role: string;
    email: string;
    phone: string;
  }>) => void;
}
```

**Behavior:**
- Opens camera, captures image
- Runs OCR (web: `tesseract.js`)
- Parses text with heuristics: name detection (capitalized words), email regex, phone regex, role/company guesses

**React Native rebuild:**
- Use `expo-camera` for capture
- Use `expo-image-picker` for gallery fallback
- For OCR: use `react-native-text-recognition` or call a server-side OCR endpoint
- Heuristic parsing logic is pure JS — copy directly from web

---

## 5. QRScanner

**Purpose:** Real-time camera QR reader that parses vCard / MECARD contact data.

**Props:**
```typescript
interface QRScannerProps {
  onExtracted: (data: Partial<{
    firstName: string;
    lastName: string;
    company: string;
    role: string;
    email: string;
    phone: string;
    linkedinUrl: string;
  }>) => void;
}
```

**Behavior:**
- Opens camera with QR detection overlay
- On scan: parses vCard 3.0 (BEGIN:VCARD / FN / ORG / TITLE / EMAIL / TEL / URL) or MECARD format
- Calls `onExtracted` with parsed fields

**React Native rebuild:**
- Use `expo-camera` with `onBarCodeScanned` prop (supports QR natively — no jsqr needed)
- vCard / MECARD parsing logic is pure JS — copy from web `QRScanner.tsx`

---

## 6. OnboardingTour

**Purpose:** First-run guided walkthrough highlighting app features.

**Props:**
```typescript
interface OnboardingTourProps {
  onComplete: () => void;
}
```

**Behavior:**
- Multi-step overlay (5–7 steps)
- Each step: title, description, optional highlight region
- Progress dots at bottom
- "Next" / "Done" buttons
- On complete: calls `onComplete` which triggers `updateSettings({ hasSeenTutorial: true })`
- Guarded by `!settings.hasSeenTutorial && !settingsLoading`

**React Native rebuild:**
- Use `Modal` with semi-transparent overlay
- Animate between steps with `Animated` or `react-native-reanimated`
- Spotlight effect with `react-native-spotlight-tour` (optional) or plain darkened overlay

---

## 7. BottomNav

**Purpose:** Fixed bottom navigation bar linking to main tabs.

**Props:** None (reads active route from router).

**Behavior:**
- Highlights active tab icon + label
- Tabs: Dashboard, Contacts, Add (+), Settings, Notifications

**React Native rebuild:**
- Handled entirely by React Navigation's `BottomTabNavigator` — no custom component needed
- Tab bar style config in `navigation.md`

---

## 8. InstallPrompt

**Purpose:** PWA install reminder banner.

**Props:** None.

**Behavior:**
- Checks if app is running in browser (not standalone PWA)
- Shows a dismissible banner prompting "Add to Home Screen"

**React Native rebuild:**
- Not applicable — native app is always installed
- Can be omitted

---

## 9. Priority computation (utility — not a visual component)

These pure functions can be copied directly:

```typescript
// From cadence.ts — no external dependencies except date-fns
import { differenceInDays, addDays } from "date-fns";

export function isInMaintenanceMode(contact: Contact, autoDowngradeAfterMonths = 6): boolean {
  const daysSince = differenceInDays(new Date(), new Date(contact.firstContactDate));
  return daysSince >= autoDowngradeAfterMonths * 30;
}

export function getEffectiveCadenceDays(contact: Contact, autoDowngradeAfterMonths = 6): number {
  return isInMaintenanceMode(contact, autoDowngradeAfterMonths) ? 180 : contact.followUpCadenceDays;
}

export function computeNextFollowUpDate(
  lastInteractionDate: string,
  contact: Contact,
  autoDowngradeAfterMonths = 6,
): Date {
  const cadence = getEffectiveCadenceDays(contact, autoDowngradeAfterMonths);
  return addDays(new Date(lastInteractionDate), cadence);
}
```

`date-fns` works in React Native — install with `npx expo install date-fns`.

---

## 10. AI suggestion logic (utility)

```typescript
// From suggest.ts — pure JS, no web dependencies
// suggestImportance(role, company, careerGoals): "High" | "Medium" | "Low"
// suggestInitialFollowUp(importance): 1 | 2 | 3 | 5 | 7 | 14
// suggestCadenceDays(importance): 14 | 30 | 60 | 90
// Copy src/lib/suggest.ts verbatim — only depends on constants defined in constants.ts
```
