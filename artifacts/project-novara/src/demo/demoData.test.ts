import { afterEach, describe, expect, it, vi } from "vitest";
import { computeHealthScore, computeStatus } from "@/lib/utils";

// The demo's dates are computed when the module loads, so each case loads a
// fresh copy under a faked clock: the picture must be the same on any day.
async function loadDemo() {
  vi.resetModules();
  return import("./demoData");
}

describe("demo data", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    "2026-06-14T09:00:00",
    "2026-10-28T23:30:00",
    "2027-03-01T00:05:00",
    "2030-12-31T12:00:00",
  ])("shows a healthy, mixed network on %s", async (now) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const { DEMO_CONTACTS } = await loadDemo();

    const connected = DEMO_CONTACTS.filter((c) => c.connectionStatus === "connected");
    const statuses = connected.map(computeStatus);

    expect(computeHealthScore(connected)).toBe(73);
    expect(statuses.filter((s) => s === "Warm")).toHaveLength(3);
    expect(statuses.filter((s) => s === "Cooling")).toHaveLength(2);
    expect(statuses.filter((s) => s === "Cold")).toHaveLength(1);

    const sarah = DEMO_CONTACTS.find((c) => c.id === "demo-sarah")!;
    expect(computeStatus(sarah)).toBe("Warm");
  });

  it("never points at a real email address", async () => {
    const { DEMO_CONTACTS } = await loadDemo();
    for (const c of DEMO_CONTACTS) {
      if (c.email) expect(c.email.endsWith("@example.com")).toBe(true);
    }
  });
});
