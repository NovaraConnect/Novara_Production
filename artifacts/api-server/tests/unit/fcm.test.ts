import { describe, it, expect, afterEach, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { buildFcmMessage, classifyFcmFailure, isFcmConfigured, sendFcm } from "../../src/lib/fcm";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const encodedKey = (over: Record<string, unknown> = {}) =>
  Buffer.from(
    JSON.stringify({
      project_id: "novara-test",
      client_email: "fcm@novara-test.iam.gserviceaccount.com",
      private_key: privateKey,
      ...over,
    }),
  ).toString("base64");

const PAYLOAD = { title: "Follow up", body: "Say hello to Ada", tag: "contact-1", url: "/contacts/1" };

afterEach(() => {
  delete process.env["FCM_SERVICE_ACCOUNT_B64"];
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("classifyFcmFailure — only delete tokens that are genuinely dead", () => {
  it("treats an uninstalled app as gone", () => {
    expect(classifyFcmFailure(404, "UNREGISTERED")).toBe("gone");
  });

  it("treats a token from another Firebase project as gone", () => {
    expect(classifyFcmFailure(403, "SENDER_ID_MISMATCH")).toBe("gone");
  });

  it("keeps the token when Google is having a bad day", () => {
    expect(classifyFcmFailure(503, "UNAVAILABLE")).toBe("retryable");
    expect(classifyFcmFailure(429, "QUOTA_EXCEEDED")).toBe("retryable");
    expect(classifyFcmFailure(500, "INTERNAL")).toBe("retryable");
  });

  it("keeps the token when the failure is our own credentials", () => {
    expect(classifyFcmFailure(401, "THIRD_PARTY_AUTH_ERROR")).toBe("retryable");
    expect(classifyFcmFailure(403, undefined)).toBe("retryable");
  });
});

describe("isFcmConfigured", () => {
  it("is off without the key, so the whole path stays inert", () => {
    expect(isFcmConfigured()).toBe(false);
  });

  it("is off for a key that is not valid", () => {
    process.env["FCM_SERVICE_ACCOUNT_B64"] = "not base64 json";
    expect(isFcmConfigured()).toBe(false);
    process.env["FCM_SERVICE_ACCOUNT_B64"] = encodedKey({ private_key: undefined });
    expect(isFcmConfigured()).toBe(false);
  });

  it("is on with a complete key", () => {
    process.env["FCM_SERVICE_ACCOUNT_B64"] = encodedKey();
    expect(isFcmConfigured()).toBe(true);
  });
});

describe("buildFcmMessage", () => {
  it("carries the deep link under the same key as APNs and Web Push", () => {
    const { message } = buildFcmMessage("device", PAYLOAD);
    expect(message.token).toBe("device");
    expect(message.notification).toEqual({ title: PAYLOAD.title, body: PAYLOAD.body });
    expect(message.data).toEqual({ url: "/contacts/1" });
    expect(message.android.notification.tag).toBe("contact-1");
  });

  it("omits data rather than sending an empty link", () => {
    expect(buildFcmMessage("device", { title: "t", body: "b" }).message.data).toBeUndefined();
  });
});

describe("sendFcm", () => {
  it("does nothing at all without the key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendFcm("device", PAYLOAD)).toBe("gone");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs in with a verifiable JWT and sends to the project's endpoint", async () => {
    process.env["FCM_SERVICE_ACCOUNT_B64"] = encodedKey({
      client_email: "signing@novara-test.iam.gserviceaccount.com",
    });
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("oauth2")
        ? jsonResponse(200, { access_token: "google-access", expires_in: 3600 })
        : jsonResponse(200, { name: "projects/novara-test/messages/1" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendFcm("device", PAYLOAD)).toBe("ok");

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    const jwt = (tokenInit.body as URLSearchParams).get("assertion")!;
    const [header, claims, signature] = jwt.split(".");
    expect(
      createVerify("RSA-SHA256")
        .update(`${header}.${claims}`)
        .verify(publicKey, Buffer.from(signature!, "base64url")),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString()).scope).toBe(
      "https://www.googleapis.com/auth/firebase.messaging",
    );

    const [sendUrl, sendInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(sendUrl).toBe("https://fcm.googleapis.com/v1/projects/novara-test/messages:send");
    expect((sendInit.headers as Record<string, string>)["Authorization"]).toBe("Bearer google-access");
  });

  it("reports an uninstalled app as gone", async () => {
    process.env["FCM_SERVICE_ACCOUNT_B64"] = encodedKey({ client_email: "gone@novara-test.iam.gserviceaccount.com" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("oauth2")
          ? jsonResponse(200, { access_token: "a" })
          : jsonResponse(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } }),
      ),
    );
    expect(await sendFcm("device", PAYLOAD)).toBe("gone");
  });

  it("never reports gone because of an outage or refused credentials", async () => {
    process.env["FCM_SERVICE_ACCOUNT_B64"] = encodedKey({ client_email: "down@novara-test.iam.gserviceaccount.com" });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, {})));
    expect(await sendFcm("device", PAYLOAD)).toBe("ok");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await sendFcm("device", PAYLOAD)).toBe("ok");
  });
});
