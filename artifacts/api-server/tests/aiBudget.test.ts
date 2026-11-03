// The per-user monthly AI cap: real SQL against real Postgres. No provider is
// called; usage is reported the same way the provider functions report it.
import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { app, authHeaders } from "./testApp";
import { pool } from "../src/db";
import { RESERVE_MICROS, monthKey, monthlyCapMicros, withAiBudget } from "../src/lib/aiBudget";
import { reportAnthropicUsage } from "../src/lib/aiUsage";
import { analyzeContactForUser } from "../src/lib/enrich";

const USER = "user_ai_budget";
const OTHER = "user_ai_budget_other";

async function spent(userId = USER, month = monthKey()): Promise<number | null> {
  const { rows } = await pool.query(
    "SELECT spent_micros FROM ai_usage_monthly WHERE user_id = $1 AND month = $2::date",
    [userId, month],
  );
  return rows[0] ? Number(rows[0].spent_micros) : null;
}

async function setSpent(micros: number, userId = USER, month = monthKey()): Promise<void> {
  await pool.query(
    "INSERT INTO ai_usage_monthly (user_id, month, spent_micros, calls) VALUES ($1, $2::date, $3, 1)",
    [userId, month, micros],
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("monthlyCapMicros", () => {
  it("defaults to $0.25", () => {
    expect(monthlyCapMicros()).toBe(250_000);
  });

  it("reads AI_USER_MONTHLY_CAP_USD and ignores junk", () => {
    vi.stubEnv("AI_USER_MONTHLY_CAP_USD", "0.10");
    expect(monthlyCapMicros()).toBe(100_000);
    vi.stubEnv("AI_USER_MONTHLY_CAP_USD", "lots");
    expect(monthlyCapMicros()).toBe(250_000);
    vi.stubEnv("AI_USER_MONTHLY_CAP_USD", "-1");
    expect(monthlyCapMicros()).toBe(250_000);
  });
});

describe("withAiBudget", () => {
  it("records what the call really cost, not the reservation", async () => {
    const result = await withAiBudget(USER, async () => {
      // 1,000 in and 200 out on Haiku 4.5 = $0.001 + $0.001.
      reportAnthropicUsage("claude-haiku-4-5", { input_tokens: 1000, output_tokens: 200 });
      return "draft";
    });
    expect(result).toEqual({ allowed: true, value: "draft" });
    expect(await spent()).toBe(2000);
  });

  it("charges nothing when no provider response came back", async () => {
    const result = await withAiBudget(USER, async () => null);
    expect(result).toEqual({ allowed: true, value: null });
    expect(await spent()).toBe(0);
  });

  it("releases the reservation when the call throws", async () => {
    await expect(withAiBudget(USER, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await spent()).toBe(0);
  });

  it("refuses without running the call once the cap is reached", async () => {
    await setSpent(monthlyCapMicros() - RESERVE_MICROS + 1);
    const fn = vi.fn(async () => "draft");
    expect(await withAiBudget(USER, fn)).toEqual({ allowed: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it("allows a call that exactly fits under the cap", async () => {
    await setSpent(monthlyCapMicros() - RESERVE_MICROS);
    const fn = vi.fn(async () => "draft");
    expect(await withAiBudget(USER, fn)).toEqual({ allowed: true, value: "draft" });
  });

  it("cannot be overrun by parallel calls", async () => {
    // Room for exactly 3 reservations; each call holds its reservation while
    // the others try, because all of them wait on the same gate.
    await setSpent(monthlyCapMicros() - RESERVE_MICROS * 3);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    const fn = vi.fn(async () => {
      await gate;
      reportAnthropicUsage("claude-haiku-4-5", { input_tokens: 1000, output_tokens: 200 });
    });

    const calls = Array.from({ length: 10 }, () => withAiBudget(USER, fn));
    // Every call has either started or been refused once 3 are running and 7 have settled.
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 100));
    open();
    const results = await Promise.all(calls);

    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(await spent()).toBe(monthlyCapMicros() - RESERVE_MICROS * 3 + 3 * 2000);
  });

  it("keeps each user's budget separate", async () => {
    await setSpent(monthlyCapMicros());
    expect((await withAiBudget(USER, async () => 1)).allowed).toBe(false);
    expect((await withAiBudget(OTHER, async () => 1)).allowed).toBe(true);
  });

  it("starts fresh in a new calendar month", async () => {
    await setSpent(monthlyCapMicros(), USER, "2020-01-01");
    expect((await withAiBudget(USER, async () => 1)).allowed).toBe(true);
    expect(await spent(USER, "2020-01-01")).toBe(monthlyCapMicros());
  });

  it("refuses AI when the usage table can't be read", async () => {
    vi.spyOn(pool, "query").mockRejectedValueOnce(new Error("db down") as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fn = vi.fn(async () => "draft");
    expect(await withAiBudget(USER, fn)).toEqual({ allowed: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it("uses month boundaries in UTC", () => {
    expect(monthKey(new Date("2026-11-30T23:59:59Z"))).toBe("2026-11-01");
    expect(monthKey(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12-01");
  });
});

describe("features past the cap", () => {
  it("contact analysis returns null, the signal for the deterministic score", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-used");
    vi.stubEnv("GEMINI_API_KEY", "");
    await setSpent(monthlyCapMicros());
    const analysis = await analyzeContactForUser(
      USER,
      { careerStatement: "Product roles in climate tech" },
      { company: "Northwind Labs" },
    );
    expect(analysis).toBeNull();
    expect(await spent()).toBe(monthlyCapMicros());
  });

  it("contact analysis reserves nothing when no AI call would happen", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-used");
    vi.stubEnv("GEMINI_API_KEY", "");
    const analysis = await analyzeContactForUser(USER, {}, { company: "Northwind Labs" });
    expect(analysis).toBeNull();
    expect(await spent()).toBeNull();
  });

  it("card parsing tells the client to use its own parser", async () => {
    vi.stubEnv("CARD_AI_PARSE", "on");
    vi.stubEnv("CARD_AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-used");
    await setSpent(monthlyCapMicros());
    await request(app).post("/api/contacts").set(authHeaders(USER)).send({ firstName: "A", lastName: "B", company: "C" });

    const res = await request(app).post("/api/parse-card-text").set(authHeaders(USER)).send({ text: "Jane Doe\nAcme" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, reason: "ai_monthly_cap" });
  });

  it("LinkedIn parsing tells the client to use its own parser", async () => {
    vi.stubEnv("LINKEDIN_AI_PARSE", "on");
    vi.stubEnv("LINKEDIN_AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-used");
    await setSpent(monthlyCapMicros());
    await request(app).post("/api/contacts").set(authHeaders(USER)).send({ firstName: "A", lastName: "B", company: "C" });

    const res = await request(app).post("/api/parse-linkedin-text").set(authHeaders(USER)).send({ text: "Jane Doe\nAcme" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, reason: "ai_monthly_cap" });
  });

  it("suggested messages fall back to the template", async () => {
    vi.stubEnv("SUGGESTED_MESSAGE_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-used");
    await setSpent(monthlyCapMicros());
    await pool.query(
      `INSERT INTO entitlements (user_id, source, status, expires_at) VALUES ($1, 'apple_iap', 'active', now() + interval '7 days')`,
      [USER],
    );
    const { body: created } = await request(app).post("/api/contacts").set(authHeaders(USER))
      .send({ firstName: "Priya", lastName: "Raman", company: "Northwind Labs" });

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const res = await request(app).post(`/api/contacts/${created.id}/suggested-message`).set(authHeaders(USER)).send({});
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("template");
    const line = log.mock.calls.find((call) => call[0] === "[suggested-message]");
    expect(JSON.parse(String(line?.[1])).reason).toBe("monthly_cap");
  });

  it("account deletion removes the usage row", async () => {
    await setSpent(1000);
    const res = await request(app).delete("/api/account").set(authHeaders(USER));
    // The Clerk user delete isn't mocked, so only the data removal is asserted.
    expect([200, 204, 500, 502]).toContain(res.status);
    expect(await spent()).toBeNull();
  });
});
