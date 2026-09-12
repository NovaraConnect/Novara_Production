import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isNativeShell,
  isStandaloneDisplayMode,
  isInstalledExperience,
} from "./installPrompt";

const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

interface Env {
  /** whether "(display-mode: standalone)" matches */
  displayModeStandalone?: boolean;
  /** iOS Safari's non-standard navigator.standalone */
  navigatorStandalone?: boolean;
  userAgent?: string;
  /** value to place at window.Capacitor; omit for none */
  capacitor?: unknown;
}

function setEnv(env: Env = {}): void {
  const win: Record<string, unknown> = {
    matchMedia: (query: string) => ({
      matches: query.includes("display-mode: standalone")
        ? env.displayModeStandalone === true
        : false,
    }),
  };
  if ("capacitor" in env) win["Capacitor"] = env.capacitor;
  vi.stubGlobal("window", win);

  const nav: Record<string, unknown> = { userAgent: env.userAgent ?? SAFARI_IOS };
  if (env.navigatorStandalone !== undefined) nav["standalone"] = env.navigatorStandalone;
  vi.stubGlobal("navigator", nav);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isNativeShell", () => {
  it("detects the Capacitor bridge", () => {
    setEnv({ capacitor: { isNativePlatform: () => true } });
    expect(isNativeShell()).toBe(true);
  });

  it("falls back to the User-Agent marker when the bridge has not injected yet", () => {
    // The realistic race: a remote-URL load can render before the bridge's
    // user script has run, so window.Capacitor is absent on first paint.
    setEnv({ userAgent: `${SAFARI_IOS} NovaraApp` });
    expect(isNativeShell()).toBe(true);
  });

  it("is false in plain mobile Safari", () => {
    setEnv({ userAgent: SAFARI_IOS });
    expect(isNativeShell()).toBe(false);
  });

  it("is false in a desktop browser", () => {
    setEnv({ userAgent: CHROME_DESKTOP });
    expect(isNativeShell()).toBe(false);
  });

  it("is false when the bridge reports a web platform", () => {
    setEnv({ capacitor: { isNativePlatform: () => false } });
    expect(isNativeShell()).toBe(false);
  });

  it("does not throw when the bridge object is malformed", () => {
    setEnv({ capacitor: { isNativePlatform: "not a function" } });
    expect(() => isNativeShell()).not.toThrow();
    expect(isNativeShell()).toBe(false);
  });

  it("does not throw when the bridge getter itself throws", () => {
    setEnv({
      capacitor: {
        isNativePlatform: () => {
          throw new Error("bridge exploded");
        },
      },
    });
    expect(() => isNativeShell()).not.toThrow();
    expect(isNativeShell()).toBe(false);
  });

  it("is false when there is no window at all (SSR / node)", () => {
    vi.stubGlobal("window", undefined);
    expect(isNativeShell()).toBe(false);
  });
});

describe("isStandaloneDisplayMode — stays narrow", () => {
  it("is true for an installed PWA in standalone display mode", () => {
    setEnv({ displayModeStandalone: true });
    expect(isStandaloneDisplayMode()).toBe(true);
  });

  it("is true for iOS Safari's navigator.standalone", () => {
    setEnv({ navigatorStandalone: true });
    expect(isStandaloneDisplayMode()).toBe(true);
  });

  it("is false in a normal browser tab", () => {
    setEnv();
    expect(isStandaloneDisplayMode()).toBe(false);
  });

  it("is NOT true merely because we are in the native shell", () => {
    // The native shell is not a PWA; this predicate must keep meaning what
    // its name says. isInstalledExperience() is the one that covers both.
    setEnv({ capacitor: { isNativePlatform: () => true } });
    expect(isStandaloneDisplayMode()).toBe(false);
  });
});

describe("isInstalledExperience — the 'do not nag about installing' predicate", () => {
  it("is true inside the native shell", () => {
    // The regression this whole change exists for: the native app used to be
    // shown the "add to home screen" gate.
    setEnv({ capacitor: { isNativePlatform: () => true } });
    expect(isInstalledExperience()).toBe(true);
  });

  it("is true inside the native shell via the User-Agent fallback alone", () => {
    setEnv({ userAgent: `${SAFARI_IOS} NovaraApp` });
    expect(isInstalledExperience()).toBe(true);
  });

  it("is true for an installed PWA", () => {
    setEnv({ displayModeStandalone: true });
    expect(isInstalledExperience()).toBe(true);
  });

  it("is false in plain mobile Safari, so browsers still get the prompt", () => {
    setEnv({ userAgent: SAFARI_IOS });
    expect(isInstalledExperience()).toBe(false);
  });

  it("is false in a desktop browser, so browsers still get the prompt", () => {
    setEnv({ userAgent: CHROME_DESKTOP });
    expect(isInstalledExperience()).toBe(false);
  });
});
