import { describe, it, expect } from "vitest";
import {
  addMoment,
  shouldAskForReview,
  MIN_ACCOUNT_AGE_MS,
  MIN_GAP_MS,
  MOMENTS_NEEDED,
  type ReviewPromptState,
} from "./reviewPrompt";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 1, 12);
const OLD_ACCOUNT = NOW - 30 * DAY;
const fresh: ReviewPromptState = { moments: 0, lastAskedAt: null, lastScoreUpDay: null };

describe("addMoment", () => {
  it("counts reaching out and adding someone every time", () => {
    let s = addMoment(fresh, "contacted", NOW);
    s = addMoment(s, "contacted", NOW);
    s = addMoment(s, "added", NOW);
    expect(s.moments).toBe(3);
  });

  it("counts a rising score at most once a day", () => {
    let s = addMoment(fresh, "scoreUp", NOW);
    s = addMoment(s, "scoreUp", NOW + 60_000);
    expect(s.moments).toBe(1);
    s = addMoment(s, "scoreUp", NOW + DAY);
    expect(s.moments).toBe(2);
  });
});

describe("shouldAskForReview", () => {
  const ready: ReviewPromptState = { ...fresh, moments: MOMENTS_NEEDED };

  it("asks once an established user has had enough good moments", () => {
    expect(shouldAskForReview(ready, OLD_ACCOUNT, NOW)).toBe(true);
  });

  it("waits for enough good moments", () => {
    expect(shouldAskForReview({ ...ready, moments: MOMENTS_NEEDED - 1 }, OLD_ACCOUNT, NOW)).toBe(false);
  });

  it("never asks a brand-new account, or one whose age is unknown", () => {
    expect(shouldAskForReview(ready, NOW - MIN_ACCOUNT_AGE_MS + 1, NOW)).toBe(false);
    expect(shouldAskForReview(ready, null, NOW)).toBe(false);
  });

  it("leaves a long gap between requests", () => {
    expect(shouldAskForReview({ ...ready, lastAskedAt: NOW - MIN_GAP_MS + DAY }, OLD_ACCOUNT, NOW)).toBe(false);
    expect(shouldAskForReview({ ...ready, lastAskedAt: NOW - MIN_GAP_MS }, OLD_ACCOUNT, NOW)).toBe(true);
  });
});
