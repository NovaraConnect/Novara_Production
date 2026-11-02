import { describe, it, expect } from "vitest";
import { billingPeriodFor } from "../../src/lib/entitlements";

describe("billingPeriodFor", () => {
  it("reads App Store product IDs exactly as before", () => {
    expect(billingPeriodFor("group.novaraconnect.app.pro.monthly")).toBe("monthly");
    expect(billingPeriodFor("group.novaraconnect.app.pro.annual")).toBe("annual");
  });

  it("reads Google Play subscription:base-plan IDs", () => {
    expect(billingPeriodFor("group.novaraconnect.app.pro:monthly")).toBe("monthly");
    expect(billingPeriodFor("group.novaraconnect.app.pro:annual")).toBe("annual");
  });

  it("knows nothing about other IDs", () => {
    expect(billingPeriodFor("group.novaraconnect.app.pro:weekly")).toBeNull();
    expect(billingPeriodFor("monthly-ish")).toBeNull();
    expect(billingPeriodFor(null)).toBeNull();
  });
});
