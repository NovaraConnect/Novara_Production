import { describe, it, expect, vi, afterEach } from "vitest";
import { isNotificationGranted } from "./webNotifications";

/**
 * Sets up the global environment the way a given browser would.
 *
 * `permission: null` models a WKWebView: there is a window, but no
 * Notification binding anywhere. That is the case that used to crash
 * ContactDetail, because `Notification?.permission` throws a ReferenceError
 * on the undeclared identifier before the `?.` is evaluated.
 */
function setNotificationEnv(permission: NotificationPermission | null): void {
  if (permission === null) {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Notification", undefined);
    return;
  }
  const notification = { permission };
  vi.stubGlobal("window", { Notification: notification });
  vi.stubGlobal("Notification", notification);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isNotificationGranted", () => {
  it("is false in a WKWebView, where Notification does not exist", () => {
    // The regression: the native shell rendered a blank page because the
    // previous check threw here instead of returning false.
    setNotificationEnv(null);
    expect(() => isNotificationGranted()).not.toThrow();
    expect(isNotificationGranted()).toBe(false);
  });

  it("is true when permission has been granted", () => {
    setNotificationEnv("granted");
    expect(isNotificationGranted()).toBe(true);
  });

  it("is false when permission was denied", () => {
    setNotificationEnv("denied");
    expect(isNotificationGranted()).toBe(false);
  });

  it("is false when permission has not been asked for yet", () => {
    setNotificationEnv("default");
    expect(isNotificationGranted()).toBe(false);
  });

  it("is false with no window at all (SSR / node)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => isNotificationGranted()).not.toThrow();
    expect(isNotificationGranted()).toBe(false);
  });
});
