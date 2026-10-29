import { describe, it, expect } from "vitest";
import { entryScriptFrom, reloadWouldInterrupt } from "./appUpdate";

const builtIndex = `<!doctype html><html><head>
<script src="https://us-assets.i.posthog.com/static/array.js"></script>
<script type="module" crossorigin src="/assets/index-C_EDvJSQ.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-Ck7gd2fL.css">
<script id="vite-plugin-pwa:register-sw" src="/registerSW.js"></script>
</head><body><div id="root"></div></body></html>`;

describe("entryScriptFrom", () => {
  it("finds the hashed entry script of a built index.html", () => {
    expect(entryScriptFrom(builtIndex)).toBe("/assets/index-C_EDvJSQ.js");
  });

  it("returns the path even when the src is absolute", () => {
    const html = builtIndex.replace('src="/assets/', 'src="https://app.novaraconnect.group/assets/');
    expect(entryScriptFrom(html)).toBe("/assets/index-C_EDvJSQ.js");
  });

  it("returns null for a page without one (dev server, error page)", () => {
    expect(entryScriptFrom('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
    expect(entryScriptFrom("Service Unavailable")).toBeNull();
  });
});

describe("reloadWouldInterrupt", () => {
  const el = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable }) as unknown as Element;

  it("protects pages with a form", () => {
    expect(reloadWouldInterrupt("/add", null)).toBe(true);
    expect(reloadWouldInterrupt("/contacts/42/edit", null)).toBe(true);
    expect(reloadWouldInterrupt("/feedback", null)).toBe(true);
    expect(reloadWouldInterrupt("/settings", null)).toBe(true);
  });

  it("protects a field that has focus anywhere", () => {
    expect(reloadWouldInterrupt("/contacts", el("INPUT"))).toBe(true);
    expect(reloadWouldInterrupt("/contacts/42", el("TEXTAREA"))).toBe(true);
    expect(reloadWouldInterrupt("/dashboard", el("DIV", true))).toBe(true);
  });

  it("allows a reload on ordinary screens", () => {
    expect(reloadWouldInterrupt("/dashboard", el("BODY"))).toBe(false);
    expect(reloadWouldInterrupt("/contacts", null)).toBe(false);
    expect(reloadWouldInterrupt("/contacts/42", el("BUTTON"))).toBe(false);
  });
});
