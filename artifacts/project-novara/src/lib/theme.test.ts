// The suite runs in the "node" environment (vitest.config.ts), so there is no
// DOM. Following the convention in installPrompt.test.ts, the few browser
// objects this module touches are stubbed rather than pulling in jsdom.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isThemeChoice,
  readStoredChoice,
  storeChoice,
  resolveTheme,
  applyTheme,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  THEME_COLOR,
  DEFAULT_THEME_CHOICE,
} from "./theme";

/** The slice of Element.classList that applyTheme uses. */
function fakeElement(initial: string[] = []) {
  const classes = new Set(initial);
  return {
    classList: {
      toggle(name: string, force?: boolean) {
        const on = force ?? !classes.has(name);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains: (name: string) => classes.has(name),
    },
    /** Test-only view of the result. */
    classes,
  };
}

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    clear: () => map.clear(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isThemeChoice", () => {
  it.each(["system", "light", "dark"])("accepts %s", (v) => {
    expect(isThemeChoice(v)).toBe(true);
  });

  it.each([["navy"], [""], [null], [undefined], [42], [{}]])("rejects %s", (v) => {
    expect(isThemeChoice(v)).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("honours an explicit light choice even on a dark device", () => {
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("honours an explicit dark choice even on a light device", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the device when set to system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("readStoredChoice", () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });

  it("defaults to following the device when nothing is stored", () => {
    expect(readStoredChoice()).toBe("system");
    expect(readStoredChoice()).toBe(DEFAULT_THEME_CHOICE);
  });

  it("round-trips a stored choice", () => {
    storeChoice("light");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(readStoredChoice()).toBe("light");
  });

  it("ignores a value it does not recognise", () => {
    storage.setItem(THEME_STORAGE_KEY, "midnight");
    expect(readStoredChoice()).toBe("system");
  });

  it("falls back to the default when storage throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem() {
          throw new Error("SecurityError");
        },
      },
    });
    expect(readStoredChoice()).toBe("system");
  });
});

describe("storeChoice", () => {
  it("does not throw when storage is unavailable", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem() {
          throw new Error("QuotaExceededError");
        },
      },
    });
    expect(() => storeChoice("dark")).not.toThrow();
  });
});

describe("systemPrefersDark", () => {
  it("reports what the media query says", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    expect(systemPrefersDark()).toBe(true);

    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(systemPrefersDark()).toBe(false);
  });

  it("assumes light when matchMedia is missing", () => {
    vi.stubGlobal("window", {});
    expect(systemPrefersDark()).toBe(false);
  });
});

describe("applyTheme", () => {
  it("adds .dark for the dark theme", () => {
    const el = fakeElement();
    applyTheme("dark", el as unknown as HTMLElement);
    expect(el.classList.contains("dark")).toBe(true);
  });

  it("removes .dark for the light theme", () => {
    const el = fakeElement(["dark"]);
    applyTheme("light", el as unknown as HTMLElement);
    expect(el.classList.contains("dark")).toBe(false);
  });

  it("is idempotent", () => {
    const el = fakeElement();
    applyTheme("dark", el as unknown as HTMLElement);
    applyTheme("dark", el as unknown as HTMLElement);
    expect([...el.classes]).toEqual(["dark"]);
  });

  it("survives having no document to find the meta tag in", () => {
    const el = fakeElement();
    expect(() => applyTheme("dark", el as unknown as HTMLElement)).not.toThrow();
  });

  it("points theme-color at the matching background", () => {
    const meta = { content: "", setAttribute(_k: string, v: string) { this.content = v; } };
    vi.stubGlobal("document", { querySelector: () => meta });

    const el = fakeElement();
    applyTheme("dark", el as unknown as HTMLElement);
    expect(meta.content).toBe(THEME_COLOR.dark);

    applyTheme("light", el as unknown as HTMLElement);
    expect(meta.content).toBe(THEME_COLOR.light);
  });

  it("defaults to the document element", () => {
    const el = fakeElement();
    vi.stubGlobal("document", {
      documentElement: el,
      querySelector: () => null,
    });
    applyTheme("dark");
    expect(el.classList.contains("dark")).toBe(true);
  });
});
