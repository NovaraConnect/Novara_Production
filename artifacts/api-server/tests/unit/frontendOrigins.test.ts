import { describe, it, expect } from "vitest";
import { allowedOrigins, frontendOrigins, DEFAULT_FRONTEND_URL } from "../../src/lib/frontendOrigins";

const APP = "https://app.novaraconnect.group";
const ANDROID = "https://android.novaraconnect.group";

describe("frontendOrigins — Android is added only when configured", () => {
  it("is exactly the main web app when ANDROID_FRONTEND_URL is unset", () => {
    expect(frontendOrigins({ FRONTEND_URL: APP })).toEqual([APP]);
  });

  it("ignores a blank ANDROID_FRONTEND_URL", () => {
    expect(frontendOrigins({ FRONTEND_URL: APP, ANDROID_FRONTEND_URL: "  " })).toEqual([APP]);
  });

  it("adds the Android copy after the main web app", () => {
    expect(frontendOrigins({ FRONTEND_URL: APP, ANDROID_FRONTEND_URL: ANDROID })).toEqual([APP, ANDROID]);
  });

  it("does not list the same origin twice", () => {
    expect(frontendOrigins({ FRONTEND_URL: APP, ANDROID_FRONTEND_URL: APP })).toEqual([APP]);
  });

  it("keeps the old fallback when FRONTEND_URL is unset", () => {
    expect(frontendOrigins({})).toEqual([DEFAULT_FRONTEND_URL]);
  });
});

describe("allowedOrigins — CORS", () => {
  it("matches the list from before Android existed when it is unset", () => {
    expect([...allowedOrigins({ FRONTEND_URL: APP })].sort()).toEqual(
      [APP, "http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"].sort(),
    );
  });

  it("lets the Android copy through when configured", () => {
    expect(allowedOrigins({ FRONTEND_URL: APP, ANDROID_FRONTEND_URL: ANDROID }).has(ANDROID)).toBe(true);
  });
});
