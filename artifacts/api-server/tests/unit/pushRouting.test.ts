import { describe, it, expect } from "vitest";
import { chooseTransports, hasNoReachableDevice } from "../../src/lib/pushRouting";

describe("chooseTransports — native wins, so nobody is notified twice", () => {
  it("prefers APNs when the user has the iOS app", () => {
    // The case this rule exists for: the PWA and the App Store build are both
    // installed, and without this the user gets every reminder twice.
    expect(chooseTransports({ apnsTokenCount: 1, webSubscriptionCount: 1 })).toEqual(["apns"]);
  });

  it("never returns both transports at once", () => {
    const transports = chooseTransports({ apnsTokenCount: 3, webSubscriptionCount: 4 });
    expect(transports).toHaveLength(1);
  });

  it("falls back to web push when there is no iOS app", () => {
    expect(chooseTransports({ apnsTokenCount: 0, webSubscriptionCount: 2 })).toEqual(["web"]);
  });

  it("uses APNs when that is the only device", () => {
    expect(chooseTransports({ apnsTokenCount: 1, webSubscriptionCount: 0 })).toEqual(["apns"]);
  });

  it("returns nothing when the user has no devices", () => {
    expect(chooseTransports({ apnsTokenCount: 0, webSubscriptionCount: 0 })).toEqual([]);
  });

  it("treats APNs as unavailable when the caller reports zero tokens", () => {
    // Callers pass 0 when APNS_* is unconfigured, which is how the whole
    // native path stays inert until the keys are set in Render.
    expect(chooseTransports({ apnsTokenCount: 0, webSubscriptionCount: 1 })).toEqual(["web"]);
  });
});

describe("hasNoReachableDevice", () => {
  it("is true only when the user has neither transport", () => {
    expect(hasNoReachableDevice({ apnsTokenCount: 0, webSubscriptionCount: 0 })).toBe(true);
    expect(hasNoReachableDevice({ apnsTokenCount: 1, webSubscriptionCount: 0 })).toBe(false);
    expect(hasNoReachableDevice({ apnsTokenCount: 0, webSubscriptionCount: 1 })).toBe(false);
  });
});
