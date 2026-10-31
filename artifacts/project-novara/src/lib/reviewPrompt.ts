// ============================================================================
// When to ask for an App Store rating.
//
// iOS shows its rating prompt at most three times a year per user, and may
// decline to show it at all, so each request is worth spending well. Novara
// asks only straight after something went well (the user reached out to a
// contact, added someone, or their Network Health went up), and only once the
// user has had a few of those moments with an account that is not brand new.
//
// Apple's rules (guideline 5.6.1): the prompt must be the system one, with no
// screen of our own before it asking whether the user is happy, and no reward
// for reviewing. So there is no "Enjoying Novara?" step here, by design.
//
// Everything is local to the device: the counts live in localStorage, and in a
// browser or an app version without the prompt nothing is ever requested.
// ============================================================================
import { canRequestNativeReview, requestNativeReview } from "./nativeBridge";
import { isAndroidShell } from "./installPrompt";

export const REVIEW_STORAGE_KEY = "novara.reviewPrompt";

/** Novara Connect on the App Store, opened on the "Write a Review" form. */
export const APP_STORE_REVIEW_URL = "https://apps.apple.com/app/id6811249861?action=write-review";

/** Novara on Google Play. Android opens this link in the Play Store app. */
export const PLAY_STORE_REVIEW_URL = "https://play.google.com/store/apps/details?id=group.novaraconnect.app";

export type PositiveMoment = "contacted" | "added" | "scoreUp";

export interface ReviewPromptState {
  /** Good moments since the last request (or ever, before the first). */
  moments: number;
  /** When Novara last asked iOS for the prompt, as epoch milliseconds. */
  lastAskedAt: number | null;
  /** The day a rising Network Health score last counted, as YYYY-MM-DD. */
  lastScoreUpDay: string | null;
}

const DAY = 24 * 60 * 60 * 1000;
/** Good moments needed before the first request, and between requests. */
export const MOMENTS_NEEDED = 3;
/** How old the account must be: a first session is too soon to judge. */
export const MIN_ACCOUNT_AGE_MS = 3 * DAY;
/** Gap between requests. Three a year is iOS's cap, so this stays under it. */
export const MIN_GAP_MS = 120 * DAY;
/** Pause after the moment, so the prompt follows the success feedback rather
 *  than covering it. */
const PROMPT_DELAY_MS = 1500;

const EMPTY: ReviewPromptState = { moments: 0, lastAskedAt: null, lastScoreUpDay: null };

export function readReviewState(): ReviewPromptState {
  try {
    const raw = window.localStorage.getItem(REVIEW_STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<ReviewPromptState>;
    return {
      moments: typeof parsed.moments === "number" ? parsed.moments : 0,
      lastAskedAt: typeof parsed.lastAskedAt === "number" ? parsed.lastAskedAt : null,
      lastScoreUpDay: typeof parsed.lastScoreUpDay === "string" ? parsed.lastScoreUpDay : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

function writeReviewState(state: ReviewPromptState): void {
  try {
    window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage full: worst case we ask a little less.
  }
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Counts one good moment. A rising score counts at most once a day, because
 *  it is seen every time the Dashboard opens. */
export function addMoment(state: ReviewPromptState, kind: PositiveMoment, now: number): ReviewPromptState {
  if (kind === "scoreUp") {
    const today = dayKey(now);
    if (state.lastScoreUpDay === today) return state;
    return { ...state, moments: state.moments + 1, lastScoreUpDay: today };
  }
  return { ...state, moments: state.moments + 1 };
}

/** Whether this is a good time to ask. */
export function shouldAskForReview(
  state: ReviewPromptState,
  accountCreatedAt: number | null,
  now: number,
): boolean {
  if (accountCreatedAt === null || now - accountCreatedAt < MIN_ACCOUNT_AGE_MS) return false;
  if (state.moments < MOMENTS_NEEDED) return false;
  if (state.lastAskedAt !== null && now - state.lastAskedAt < MIN_GAP_MS) return false;
  return true;
}

/**
 * Call right after something went well. Asks iOS for the rating prompt when
 * the user has earned it; otherwise just counts the moment. Never throws.
 */
export function recordPositiveMoment(kind: PositiveMoment, accountCreatedAt: Date | number | null | undefined): void {
  if (!canRequestNativeReview()) return;
  const now = Date.now();
  const created = accountCreatedAt == null ? null : new Date(accountCreatedAt).getTime();
  const state = addMoment(readReviewState(), kind, now);
  if (!shouldAskForReview(state, Number.isNaN(created) ? null : created, now)) {
    writeReviewState(state);
    return;
  }
  writeReviewState({ ...state, moments: 0, lastAskedAt: now });
  window.setTimeout(() => {
    requestNativeReview().catch(() => {
      // No window yet, or an older build: nothing to show, nothing to fix.
    });
  }, PROMPT_DELAY_MS);
}

/** Opens the store's review page, for the "Rate Novara" row in Settings.
 *  In the iOS app, the shell hands the link to iOS, which opens the App Store;
 *  in the Android app it goes to Novara's Google Play page. */
export function openAppStoreReview(): void {
  window.open(isAndroidShell() ? PLAY_STORE_REVIEW_URL : APP_STORE_REVIEW_URL, "_blank", "noopener");
}
