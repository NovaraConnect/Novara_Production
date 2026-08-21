import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mocked before importing testApp so the route module picks up the mock.
// Lets the "email failure doesn't lose the DB row" test simulate a rejected
// send without needing a real (or fake) Resend API key.
vi.mock("../src/lib/email", () => ({
  sendFeedbackNotification: vi.fn(),
}));

const { app, authHeaders, forcedAuthErrorHeaders } = await import("./testApp");
const { sendFeedbackNotification } = await import("../src/lib/email");
const { pool } = await import("../src/db");

const USER_A = "user_test_feedback_a";

function validFeedback(overrides: Record<string, unknown> = {}) {
  return {
    type: "bug",
    subject: "Dashboard freezes on load",
    description: "Steps to reproduce: open the dashboard tab, wait 5 seconds, app hangs.",
    contactEmail: "user@example.com",
    mayContact: true,
    pageUrl: "/dashboard",
    userAgent: "Mozilla/5.0 (test)",
    appVersion: "2.0.0",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(sendFeedbackNotification).mockReset();
  vi.mocked(sendFeedbackNotification).mockResolvedValue(undefined);
});

describe("POST /api/feedback", () => {
  it("returns 401 for an unauthenticated request", async () => {
    const res = await request(app).post("/api/feedback").send(validFeedback());
    expect(res.status).toBe(401);
  });

  it("returns 401 when Clerk verification fails", async () => {
    const res = await request(app)
      .post("/api/feedback")
      .set(forcedAuthErrorHeaders())
      .send(validFeedback());
    expect(res.status).toBe(401);
  });

  it("creates a feedback submission for a valid authenticated request", async () => {
    const res = await request(app)
      .post("/api/feedback")
      .set(authHeaders(USER_A))
      .send(validFeedback());

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.type).toBe("bug");
    expect(res.body.subject).toBe("Dashboard freezes on load");
    expect(res.body.status).toBe("new");

    const { rows } = await pool.query("SELECT * FROM feedback WHERE id = $1", [res.body.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USER_A);
    expect(rows[0].description).toBe(validFeedback().description);
    expect(rows[0].contact_email).toBe("user@example.com");
    expect(rows[0].may_contact).toBe(true);
    expect(rows[0].page_url).toBe("/dashboard");
    expect(rows[0].app_version).toBe("2.0.0");
  });

  it("stores the authenticated userId, ignoring any userId sent in the body", async () => {
    const res = await request(app)
      .post("/api/feedback")
      .set(authHeaders(USER_A))
      .send(validFeedback({ userId: "someone-elses-id" }));

    expect(res.status).toBe(201);
    const { rows } = await pool.query("SELECT user_id FROM feedback WHERE id = $1", [res.body.id]);
    expect(rows[0].user_id).toBe(USER_A);
    expect(rows[0].user_id).not.toBe("someone-elses-id");
  });

  it("rejects a submission missing required fields with 400", async () => {
    const res = await request(app)
      .post("/api/feedback")
      .set(authHeaders(USER_A))
      .send({ type: "bug" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("rejects an invalid type with 400", async () => {
    const res = await request(app)
      .post("/api/feedback")
      .set(authHeaders(USER_A))
      .send(validFeedback({ type: "not-a-real-type" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid contactEmail with 400", async () => {
    const res = await request(app)
      .post("/api/feedback")
      .set(authHeaders(USER_A))
      .send(validFeedback({ contactEmail: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("accepts a submission with no optional fields at all", async () => {
    const res = await request(app)
      .post("/api/feedback")
      .set(authHeaders(USER_A))
      .send({
        type: "general",
        subject: "Love the app",
        description: "Just wanted to say thanks!",
      });
    expect(res.status).toBe(201);
  });

  it("still preserves the DB record when the email notification fails", async () => {
    vi.mocked(sendFeedbackNotification).mockRejectedValueOnce(new Error("Resend API down"));

    const res = await request(app)
      .post("/api/feedback")
      .set(authHeaders(USER_A))
      .send(validFeedback({ subject: "Email will fail for this one" }));

    // The client-facing response must still succeed -- email delivery is
    // best-effort and happens after the response is sent.
    expect(res.status).toBe(201);

    // Give the fire-and-forget email call's rejection handler a tick to run.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const { rows } = await pool.query("SELECT * FROM feedback WHERE id = $1", [res.body.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe("Email will fail for this one");
  });

  it("enforces a per-user rate limit on submissions", async () => {
    const RATE_LIMIT_USER = "user_test_feedback_ratelimit";

    // The route's limiter allows 10 requests/hour per authenticated user.
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/feedback")
        .set(authHeaders(RATE_LIMIT_USER))
        .send(validFeedback({ subject: `Submission ${i}` }));
      expect(res.status).toBe(201);
    }

    const limited = await request(app)
      .post("/api/feedback")
      .set(authHeaders(RATE_LIMIT_USER))
      .send(validFeedback({ subject: "One too many" }));
    expect(limited.status).toBe(429);
  });
});
