import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { canUseNativePurchases, NATIVE_PURCHASE_BRIDGE_VERSION } from "./nativeBridge";

type W = Window & { Capacitor?: unknown; NovaraNative?: unknown };
const noop = async () => ({});

function fullBridge(version: number) {
  return {
    version,
    platform: "ios",
    navigate() {},
    replace() {},
    back() {},
    haptic() {},
    getProducts: noop,
    identifyPurchases: noop,
    purchase: noop,
    restorePurchases: noop,
    manageSubscriptions: noop,
  };
}

describe("canUseNativePurchases", () => {
  const w = globalThis as unknown as { window?: W };
  let savedWindow: unknown;

  beforeEach(() => {
    savedWindow = w.window;
    w.window = { Capacitor: { isNativePlatform: () => true } } as unknown as W;
  });
  afterEach(() => {
    w.window = savedWindow as W;
  });

  it("is off in a browser", () => {
    w.window = {} as unknown as W;
    expect(canUseNativePurchases()).toBe(false);
  });

  it("is off on a bridge older than the purchase version", () => {
    (w.window as W).NovaraNative = fullBridge(NATIVE_PURCHASE_BRIDGE_VERSION - 1);
    expect(canUseNativePurchases()).toBe(false);
  });

  it("is on in the native shell with a purchase-capable bridge", () => {
    (w.window as W).NovaraNative = fullBridge(NATIVE_PURCHASE_BRIDGE_VERSION);
    expect(canUseNativePurchases()).toBe(true);
  });

  it("is off when a purchase method is missing", () => {
    const bridge = fullBridge(NATIVE_PURCHASE_BRIDGE_VERSION) as Record<string, unknown>;
    delete bridge.purchase;
    (w.window as W).NovaraNative = bridge;
    expect(canUseNativePurchases()).toBe(false);
  });
});
