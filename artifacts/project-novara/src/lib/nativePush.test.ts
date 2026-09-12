import { describe, it, expect } from "vitest";
import { interpretNativePermission, resolveApnsEnvironment } from "./nativePush";

describe("interpretNativePermission", () => {
  it("maps granted", () => {
    expect(interpretNativePermission({ receive: "granted" })).toBe("granted");
  });

  it("maps denied", () => {
    expect(interpretNativePermission({ receive: "denied" })).toBe("denied");
  });

  it("treats prompt as undecided, not denied", () => {
    // Getting this wrong would show "turned off in iOS Settings" to someone
    // who has simply not been asked yet.
    expect(interpretNativePermission({ receive: "prompt" })).toBe("default");
    expect(interpretNativePermission({ receive: "prompt-with-rationale" })).toBe("default");
  });

  it("treats a missing or malformed result as undecided", () => {
    expect(interpretNativePermission(undefined)).toBe("default");
    expect(interpretNativePermission(null)).toBe("default");
    expect(interpretNativePermission({})).toBe("default");
    expect(interpretNativePermission({ receive: "something-new" })).toBe("default");
  });
});

describe("resolveApnsEnvironment", () => {
  it("defaults to production, which is what TestFlight and the App Store mint", () => {
    // Defaulting to sandbox would break every real user, so the safe default
    // is the one real builds use.
    expect(resolveApnsEnvironment(undefined)).toBe("production");
    expect(resolveApnsEnvironment("")).toBe("production");
  });

  it("honours an explicit sandbox override for Xcode debug builds", () => {
    expect(resolveApnsEnvironment("sandbox")).toBe("sandbox");
  });

  it("ignores anything that is not exactly sandbox", () => {
    expect(resolveApnsEnvironment("Sandbox")).toBe("production");
    expect(resolveApnsEnvironment("dev")).toBe("production");
  });
});
