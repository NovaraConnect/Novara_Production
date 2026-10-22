// Integration tests for university organizations, seats, invitations and
// entitlements. Runs against the real Postgres (see tests/setup.ts).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app, authHeaders, setTestClerkUser } from "./testApp";
import { pool } from "../src/db";

const PLATFORM = "user_platform_admin";
const ADMIN = "user_org_admin";
const STUDENT_A = "user_student_a";
const STUDENT_B = "user_student_b";
const STUDENT_C = "user_student_c";
const OUTSIDER = "user_outsider";

const ADMIN_EMAIL = "admin@school.edu";
const A_EMAIL = "a@school.edu";
const B_EMAIL = "b@school.edu";
const C_EMAIL = "c@school.edu";

function tokenFrom(inviteUrl: string): string {
  return new URL(inviteUrl).hash.slice(1);
}

/** Org whose admin has already accepted, so they are an active member. */
async function createOrgWithActiveAdmin(seatLimit: number) {
  const { organization, adminInvitation } = await createOrg({ seatLimit });
  const accept = await acceptAs(ADMIN, ADMIN_EMAIL, tokenFrom(adminInvitation!.inviteUrl));
  expect(accept.status).toBe(200);
  return { organization };
}

function contact(i: number) {
  return { firstName: `F${i}`, lastName: "L", company: "Acme" };
}

async function createOrg(opts: { seatLimit?: number; adminEmail?: string | null } = {}) {
  const res = await request(app)
    .post("/api/admin/organizations")
    .set(authHeaders(PLATFORM))
    .send({
      name: "State University",
      seatLimit: opts.seatLimit ?? 5,
      ...(opts.adminEmail === null ? {} : { adminEmail: opts.adminEmail ?? ADMIN_EMAIL }),
    });
  expect(res.status).toBe(201);
  return res.body as {
    organization: { id: string; name: string };
    adminInvitation: { id: string; inviteUrl: string } | null;
  };
}

async function inviteStudent(orgId: string, email: string, actor = ADMIN) {
  return request(app)
    .post(`/api/organizations/${orgId}/invitations`)
    .set(authHeaders(actor))
    .send({ email });
}

async function acceptAs(userId: string, email: string, token: string, verified = true) {
  setTestClerkUser(userId, { email, verified });
  return request(app)
    .post("/api/invitations/accept")
    .set(authHeaders(userId))
    .send({ token });
}

let savedFlag: string | undefined;
let savedAdmins: string | undefined;

beforeEach(() => {
  savedFlag = process.env["UNIVERSITY_ACCESS_ENABLED"];
  savedAdmins = process.env["PLATFORM_ADMIN_USER_IDS"];
  process.env["UNIVERSITY_ACCESS_ENABLED"] = "true";
  process.env["PLATFORM_ADMIN_USER_IDS"] = PLATFORM;
  process.env["INVITE_BASE_URL"] = "https://app.novaraconnect.group";
});

afterEach(() => {
  for (const [k, v] of [["UNIVERSITY_ACCESS_ENABLED", savedFlag], ["PLATFORM_ADMIN_USER_IDS", savedAdmins]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("feature flag", () => {
  beforeEach(() => {
    delete process.env["UNIVERSITY_ACCESS_ENABLED"];
  });

  it("returns 404 on every university route while off, even for platform admins", async () => {
    const checks = [
      request(app).post("/api/admin/organizations").set(authHeaders(PLATFORM)).send({ name: "x", seatLimit: 1 }),
      request(app).get("/api/entitlements/me").set(authHeaders(STUDENT_A)),
      request(app).post("/api/invitations/preview").set(authHeaders(STUDENT_A)).send({ token: "a".repeat(43) }),
      request(app).post("/api/invitations/accept").set(authHeaders(STUDENT_A)).send({ token: "a".repeat(43) }),
      request(app).get("/api/organizations/00000000-0000-4000-8000-000000000000").set(authHeaders(ADMIN)),
    ];
    for (const res of await Promise.all(checks)) {
      expect(res.status).toBe(404);
    }
  });

  it("is reported to the client as false in /api/features", async () => {
    const res = await request(app).get("/api/features");
    expect(res.status).toBe(200);
    expect(res.body.universityAccess).toBe(false);
  });

  it("leaves the free contact limit at 6 with the feature off", async () => {
    for (let i = 0; i < 6; i++) {
      const ok = await request(app).post("/api/contacts").set(authHeaders(STUDENT_A)).send(contact(i));
      expect(ok.status).toBe(201);
    }
    const blocked = await request(app).post("/api/contacts").set(authHeaders(STUDENT_A)).send(contact(6));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("CONTACT_LIMIT_REACHED");
  });
});

describe("platform admin creates organizations", () => {
  it("creates an organization and returns an invite link in the fragment", async () => {
    const { organization, adminInvitation } = await createOrg();
    expect(organization.name).toBe("State University");
    expect(adminInvitation).not.toBeNull();
    const url = new URL(adminInvitation!.inviteUrl);
    expect(url.pathname).toBe("/invite");
    expect(url.search).toBe("");
    expect(url.hash.length).toBeGreaterThan(1);
  });

  it("stores only the hash of the token", async () => {
    const { adminInvitation } = await createOrg();
    const raw = tokenFrom(adminInvitation!.inviteUrl);
    const { rows } = await pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM organization_invitations WHERE id = $1",
      [adminInvitation!.id],
    );
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.token_hash).not.toBe(raw);
  });

  it("refuses a non-platform user with 404", async () => {
    const res = await request(app)
      .post("/api/admin/organizations")
      .set(authHeaders(ADMIN))
      .send({ name: "Sneaky", seatLimit: 10 });
    expect(res.status).toBe(404);
  });

  it("rejects an admin invite when there are zero seats", async () => {
    const res = await request(app)
      .post("/api/admin/organizations")
      .set(authHeaders(PLATFORM))
      .send({ name: "No Seats", seatLimit: 0, adminEmail: ADMIN_EMAIL });
    expect(res.status).toBe(400);
  });

  it("validates input", async () => {
    const bad = [
      { name: "", seatLimit: 1 },
      { name: "ok", seatLimit: -1 },
      { name: "ok", seatLimit: 1.5 },
      { name: "ok", seatLimit: 1, accessEndsAt: "2001-01-01T00:00:00Z" },
      { name: "ok", seatLimit: 1, adminEmail: "not-an-email" },
    ];
    for (const body of bad) {
      const res = await request(app).post("/api/admin/organizations").set(authHeaders(PLATFORM)).send(body);
      expect(res.status).toBe(400);
    }
  });
});

describe("accepting an invitation", () => {
  it("activates the admin, grants university access, and lifts the contact limit", async () => {
    const { organization, adminInvitation } = await createOrg();
    const token = tokenFrom(adminInvitation!.inviteUrl);

    const preview = await request(app).post("/api/invitations/preview").set(authHeaders(ADMIN)).send({ token });
    expect(preview.status).toBe(200);
    expect(preview.body.organizationName).toBe("State University");
    expect(preview.body.emailHint).toBe("a***@school.edu");
    expect(JSON.stringify(preview.body)).not.toContain(ADMIN_EMAIL);

    const accept = await acceptAs(ADMIN, ADMIN_EMAIL, token);
    expect(accept.status).toBe(200);
    expect(accept.body.role).toBe("admin");

    const ent = await request(app).get("/api/entitlements/me").set(authHeaders(ADMIN));
    expect(ent.body.university.active).toBe(true);
    expect(ent.body.university.organizationId).toBe(organization.id);

    for (let i = 0; i < 7; i++) {
      const ok = await request(app).post("/api/contacts").set(authHeaders(ADMIN)).send(contact(i));
      expect(ok.status).toBe(201);
    }
  });

  it("refuses an email that does not match the invitation", async () => {
    const { adminInvitation } = await createOrg();
    const token = tokenFrom(adminInvitation!.inviteUrl);
    const res = await acceptAs(OUTSIDER, "someone@else.edu", token);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("email_mismatch");
    expect(JSON.stringify(res.body)).not.toContain(ADMIN_EMAIL);
  });

  it("refuses an unverified primary email", async () => {
    const { adminInvitation } = await createOrg();
    const token = tokenFrom(adminInvitation!.inviteUrl);
    const res = await acceptAs(ADMIN, ADMIN_EMAIL, token, false);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("email_not_verified");
  });

  it("refuses a user Clerk does not know about", async () => {
    const { adminInvitation } = await createOrg();
    const token = tokenFrom(adminInvitation!.inviteUrl);
    const res = await request(app).post("/api/invitations/accept").set(authHeaders("user_unknown")).send({ token });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("email_not_verified");
  });

  it("never grants access from a .edu domain alone", async () => {
    // Same university domain, not invited. Must not get in.
    await createOrg();
    // Only a pending invitation exists. No membership was created for anyone.
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM organization_members");
    expect(rows[0].n).toBe(0);

    const ent = await request(app).get("/api/entitlements/me").set(authHeaders(STUDENT_A));
    expect(ent.body.university.active).toBe(false);
  });

  it("returns 404 for an unknown or malformed token", async () => {
    const unknown = await request(app).post("/api/invitations/preview").set(authHeaders(STUDENT_A)).send({ token: "a".repeat(43) });
    expect(unknown.status).toBe(404);
    const malformed = await request(app).post("/api/invitations/preview").set(authHeaders(STUDENT_A)).send({ token: "short" });
    expect(malformed.status).toBe(404);
  });

  it("does not accept a token supplied in the query string", async () => {
    const { adminInvitation } = await createOrg();
    const token = tokenFrom(adminInvitation!.inviteUrl);
    const res = await request(app)
      .post(`/api/invitations/preview?token=${token}`)
      .set(authHeaders(ADMIN))
      .send({});
    expect(res.status).toBe(404);
  });

  it("is idempotent for the same active member", async () => {
    const { adminInvitation } = await createOrg();
    const token = tokenFrom(adminInvitation!.inviteUrl);
    expect((await acceptAs(ADMIN, ADMIN_EMAIL, token)).status).toBe(200);
    const again = await acceptAs(ADMIN, ADMIN_EMAIL, token);
    expect(again.status).toBe(200);
  });

  it("refuses a used invitation for a different user with 410", async () => {
    const { adminInvitation } = await createOrg();
    const token = tokenFrom(adminInvitation!.inviteUrl);
    expect((await acceptAs(ADMIN, ADMIN_EMAIL, token)).status).toBe(200);
    // Same address registered to a second account: still refused, status is accepted.
    const res = await acceptAs(OUTSIDER, ADMIN_EMAIL, token);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("already_used");
  });

  it("refuses an expired invitation and marks it expired", async () => {
    const { adminInvitation } = await createOrg();
    const token = tokenFrom(adminInvitation!.inviteUrl);
    await pool.query(
      "UPDATE organization_invitations SET expires_at = now() - interval '1 day' WHERE id = $1",
      [adminInvitation!.id],
    );
    const res = await acceptAs(ADMIN, ADMIN_EMAIL, token);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("invitation_expired");
    const { rows } = await pool.query("SELECT status FROM organization_invitations WHERE id = $1", [adminInvitation!.id]);
    expect(rows[0].status).toBe("expired");
  });

  it("refuses a revoked invitation", async () => {
    const { organization } = await createOrgWithActiveAdmin(3);
    const inv = await inviteStudent(organization.id, A_EMAIL);
    const token = tokenFrom(inv.body.inviteUrl);
    const rev = await request(app)
      .post(`/api/organizations/${organization.id}/invitations/${inv.body.id}/revoke`)
      .set(authHeaders(ADMIN));
    expect(rev.status).toBe(200);
    const res = await acceptAs(STUDENT_A, A_EMAIL, token);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("revoked");
  });

  it("refuses when the organization is suspended", async () => {
    const { organization, adminInvitation } = await createOrg();
    const token = tokenFrom(adminInvitation!.inviteUrl);
    await request(app).patch(`/api/admin/organizations/${organization.id}`).set(authHeaders(PLATFORM)).send({ status: "suspended" });
    const res = await acceptAs(ADMIN, ADMIN_EMAIL, token);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("organization_inactive");
  });

  it("refuses when the contract end date has passed", async () => {
    const { organization, adminInvitation } = await createOrg();
    const token = tokenFrom(adminInvitation!.inviteUrl);
    await pool.query("UPDATE organizations SET access_ends_at = now() - interval '1 minute' WHERE id = $1", [organization.id]);
    const res = await acceptAs(ADMIN, ADMIN_EMAIL, token);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("organization_inactive");
  });
});

describe("seats", () => {
  it("refuses the second student when the single seat is taken", async () => {
    const { organization, adminInvitation } = await createOrg({ seatLimit: 1 });
    expect((await acceptAs(ADMIN, ADMIN_EMAIL, tokenFrom(adminInvitation!.inviteUrl))).status).toBe(200);

    const inv = await inviteStudent(organization.id, A_EMAIL);
    expect(inv.status).toBe(201);
    const res = await acceptAs(STUDENT_A, A_EMAIL, tokenFrom(inv.body.inviteUrl));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("seats_full");
  });

  it("lets exactly one of two concurrent accepts win when one seat is left", async () => {
    // Admin holds 1 of 2 seats, leaving exactly one for the two students racing.
    const { organization } = await createOrgWithActiveAdmin(2);

    const invA = await inviteStudent(organization.id, A_EMAIL);
    const invB = await inviteStudent(organization.id, B_EMAIL);
    const tokA = tokenFrom(invA.body.inviteUrl);
    const tokB = tokenFrom(invB.body.inviteUrl);

    setTestClerkUser(STUDENT_A, { email: A_EMAIL });
    setTestClerkUser(STUDENT_B, { email: B_EMAIL });

    const [ra, rb] = await Promise.all([
      request(app).post("/api/invitations/accept").set(authHeaders(STUDENT_A)).send({ token: tokA }),
      request(app).post("/api/invitations/accept").set(authHeaders(STUDENT_B)).send({ token: tokB }),
    ]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 409]);
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM organization_members WHERE organization_id = $1 AND status = 'active'",
      [organization.id],
    );
    expect(rows[0].n).toBe(2); // admin + exactly one student
  });

  it("refuses to lower the seat limit below active members", async () => {
    const { organization, adminInvitation } = await createOrg({ seatLimit: 3 });
    expect((await acceptAs(ADMIN, ADMIN_EMAIL, tokenFrom(adminInvitation!.inviteUrl))).status).toBe(200);
    const inv = await inviteStudent(organization.id, A_EMAIL);
    expect((await acceptAs(STUDENT_A, A_EMAIL, tokenFrom(inv.body.inviteUrl))).status).toBe(200);

    const res = await request(app)
      .patch(`/api/admin/organizations/${organization.id}`)
      .set(authHeaders(PLATFORM))
      .send({ seatLimit: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("seat_limit_below_members");

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM organization_members WHERE organization_id = $1 AND status = 'active'",
      [organization.id],
    );
    expect(rows[0].n).toBe(2);
  });
});

describe("revocation", () => {
  it("removes access at once when an admin revokes a member", async () => {
    const { organization, adminInvitation } = await createOrg({ seatLimit: 3 });
    expect((await acceptAs(ADMIN, ADMIN_EMAIL, tokenFrom(adminInvitation!.inviteUrl))).status).toBe(200);
    const inv = await inviteStudent(organization.id, A_EMAIL);
    expect((await acceptAs(STUDENT_A, A_EMAIL, tokenFrom(inv.body.inviteUrl))).status).toBe(200);

    const members = await request(app).get(`/api/organizations/${organization.id}/members`).set(authHeaders(ADMIN));
    const studentRow = members.body.find((m: { role: string }) => m.role === "member");
    const rev = await request(app)
      .post(`/api/organizations/${organization.id}/members/${studentRow.id}/revoke`)
      .set(authHeaders(ADMIN));
    expect(rev.status).toBe(200);

    const ent = await request(app).get("/api/entitlements/me").set(authHeaders(STUDENT_A));
    expect(ent.body.university.active).toBe(false);

    // Contact limit returns to the free ceiling.
    for (let i = 0; i < 6; i++) {
      expect((await request(app).post("/api/contacts").set(authHeaders(STUDENT_A)).send(contact(i))).status).toBe(201);
    }
    expect((await request(app).post("/api/contacts").set(authHeaders(STUDENT_A)).send(contact(6))).status).toBe(403);
  });

  it("refuses to revoke the last active admin", async () => {
    const { organization, adminInvitation } = await createOrg({ seatLimit: 2 });
    expect((await acceptAs(ADMIN, ADMIN_EMAIL, tokenFrom(adminInvitation!.inviteUrl))).status).toBe(200);
    const members = await request(app).get(`/api/organizations/${organization.id}/members`).set(authHeaders(ADMIN));
    const self = members.body[0];
    const res = await request(app)
      .post(`/api/organizations/${organization.id}/members/${self.id}/revoke`)
      .set(authHeaders(ADMIN));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("last_admin");
  });

  it("revokes a pending invitation and reports a second revoke as already revoked", async () => {
    const { organization } = await createOrgWithActiveAdmin(2);
    const inv = await inviteStudent(organization.id, A_EMAIL);
    const first = await request(app)
      .post(`/api/organizations/${organization.id}/invitations/${inv.body.id}/revoke`)
      .set(authHeaders(ADMIN));
    expect(first.status).toBe(200);
    const second = await request(app)
      .post(`/api/organizations/${organization.id}/invitations/${inv.body.id}/revoke`)
      .set(authHeaders(ADMIN));
    expect(second.status).toBe(200);
  });
});

describe("organization admin scope", () => {
  it("refuses a plain member on admin routes with 403", async () => {
    const { organization, adminInvitation } = await createOrg({ seatLimit: 3 });
    expect((await acceptAs(ADMIN, ADMIN_EMAIL, tokenFrom(adminInvitation!.inviteUrl))).status).toBe(200);
    const inv = await inviteStudent(organization.id, A_EMAIL);
    expect((await acceptAs(STUDENT_A, A_EMAIL, tokenFrom(inv.body.inviteUrl))).status).toBe(200);

    const res = await request(app)
      .post(`/api/organizations/${organization.id}/invitations`)
      .set(authHeaders(STUDENT_A))
      .send({ email: C_EMAIL });
    expect(res.status).toBe(403);
    const members = await request(app).get(`/api/organizations/${organization.id}/members`).set(authHeaders(STUDENT_A));
    expect(members.status).toBe(403);
  });

  it("returns 404 to a non-member for any organization route", async () => {
    const { organization } = await createOrg();
    const res = await request(app).get(`/api/organizations/${organization.id}`).set(authHeaders(OUTSIDER));
    expect(res.status).toBe(404);
  });

  it("does not let an admin of one organization act on another", async () => {
    const orgA = await createOrg({ seatLimit: 2, adminEmail: ADMIN_EMAIL });
    expect((await acceptAs(ADMIN, ADMIN_EMAIL, tokenFrom(orgA.adminInvitation!.inviteUrl))).status).toBe(200);

    const orgB = await createOrg({ seatLimit: 2, adminEmail: null });
    const res = await request(app).get(`/api/organizations/${orgB.organization.id}/members`).set(authHeaders(ADMIN));
    expect(res.status).toBe(404);
    const invite = await inviteStudent(orgB.organization.id, C_EMAIL, ADMIN);
    expect(invite.status).toBe(404);
  });

  it("rejects a malformed organization id with 404 rather than a database error", async () => {
    const res = await request(app).get("/api/organizations/not-a-uuid").set(authHeaders(ADMIN));
    expect(res.status).toBe(404);
  });

  it("refuses a duplicate live invitation for the same address", async () => {
    const { organization } = await createOrgWithActiveAdmin(2);
    expect((await inviteStudent(organization.id, A_EMAIL)).status).toBe(201);
    const dup = await inviteStudent(organization.id, A_EMAIL);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("invitation_pending");
  });

  it("rotates the token on resend and kills the old link", async () => {
    const { organization } = await createOrgWithActiveAdmin(2);
    const inv = await inviteStudent(organization.id, A_EMAIL);
    const oldToken = tokenFrom(inv.body.inviteUrl);
    const resent = await request(app)
      .post(`/api/organizations/${organization.id}/invitations/${inv.body.id}/resend`)
      .set(authHeaders(ADMIN));
    expect(resent.status).toBe(200);
    const newToken = tokenFrom(resent.body.inviteUrl);
    expect(newToken).not.toBe(oldToken);

    expect((await request(app).post("/api/invitations/preview").set(authHeaders(STUDENT_A)).send({ token: oldToken })).status).toBe(404);
    expect((await request(app).post("/api/invitations/preview").set(authHeaders(STUDENT_A)).send({ token: newToken })).status).toBe(200);
  });

  it("lists invitations and members without exposing tokens, hashes, emails or Clerk IDs", async () => {
    const { organization, adminInvitation } = await createOrg({ seatLimit: 2 });
    expect((await acceptAs(ADMIN, ADMIN_EMAIL, tokenFrom(adminInvitation!.inviteUrl))).status).toBe(200);
    await inviteStudent(organization.id, A_EMAIL);
    const invites = await request(app).get(`/api/organizations/${organization.id}/invitations`).set(authHeaders(ADMIN));
    const members = await request(app).get(`/api/organizations/${organization.id}/members`).set(authHeaders(ADMIN));
    const body = JSON.stringify([invites.body, members.body]);
    expect(body).not.toContain("token");
    expect(body).not.toContain(A_EMAIL);
    expect(body).not.toContain(ADMIN);
    expect(body).not.toContain("user_");
  });
});

describe("entitlement read", () => {
  it("reports inactive for a user with no membership", async () => {
    const res = await request(app).get("/api/entitlements/me").set(authHeaders(OUTSIDER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ university: { active: false } });
  });

  it("reports the organization and role for an active member", async () => {
    const { organization, adminInvitation } = await createOrg({ seatLimit: 2 });
    expect((await acceptAs(ADMIN, ADMIN_EMAIL, tokenFrom(adminInvitation!.inviteUrl))).status).toBe(200);
    const res = await request(app).get("/api/entitlements/me").set(authHeaders(ADMIN));
    expect(res.body.university).toMatchObject({
      active: true,
      organizationId: organization.id,
      organizationName: "State University",
      role: "admin",
    });
  });

  it("requires sign-in", async () => {
    const res = await request(app).get("/api/entitlements/me");
    expect(res.status).toBe(401);
  });
});
