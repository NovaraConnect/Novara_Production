// ============================================================================
// University organizations, seats, invitations and entitlements.
//
// Everything here is behind UNIVERSITY_ACCESS_ENABLED (404 when off). Each
// route lists its gates explicitly, in order: flag, then auth, then role. No
// router-level middleware is used, so no unrelated /api route is affected.
//
// Tokens travel in request BODIES only, never in the path or query string.
// The raw token is returned exactly once, in the invite link created for an
// admin, and is never stored.
// ============================================================================
import { Router, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { requireUniversityFlag } from "../middlewares/requireUniversityFlag";
import { requirePlatformAdmin } from "../middlewares/requirePlatformAdmin";
import { requireOrgRole, orgContext, isUuid } from "../lib/orgAuth";
import {
  universityEntitlementFor,
  syncOrganizationEntitlements,
} from "../lib/entitlements";
import {
  createInviteToken,
  hashToken,
  inviteUrlFor,
  isWellFormedToken,
  maskEmail,
  normalizeEmail,
  INVITE_TTL_MS,
} from "../lib/invitations";
import { sendOrganizationInvitationEmail } from "../lib/email";
import { verifiedPrimaryEmail } from "../lib/clerkEmail";
import { logger } from "../lib/logger";

const router = Router();

type Handler = (req: Request, res: Response) => Promise<void>;

/** Routes thrown errors to the app's error handler (500) instead of hanging. */
function wrap(fn: Handler): RequestHandler {
  return (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

const flagAndAuth: RequestHandler[] = [requireUniversityFlag, requireAuth];

// Per-user limit on the token endpoints. Keyed by user, not IP, because the
// token endpoints are only reachable after sign-in.
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthedRequest).userId ?? "anonymous",
});

// ── Helpers ─────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string;
  status: string;
  seat_limit: number;
  access_ends_at: Date | null;
  created_at: Date;
}

function orgDto(row: OrgRow, seatsUsed?: number) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    seatLimit: row.seat_limit,
    ...(seatsUsed !== undefined ? { seatsUsed } : {}),
    accessEndsAt: row.access_ends_at ? row.access_ends_at.toISOString() : null,
  };
}

async function countActiveSeats(db: Pick<PoolClient, "query">, orgId: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM organization_members WHERE organization_id = $1 AND status = 'active'",
    [orgId],
  );
  return parseInt(rows[0]?.n ?? "0", 10);
}

/** Parses an optional ISO date. Returns undefined when absent, null on junk or
 *  a date that is not in the future. The caller decides what that means. */
function parseFutureDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return null;
  return d;
}

/** Creates a pending invitation row. Throws SQLSTATE 23505 on a duplicate live invite. */
async function insertInvitation(
  db: Pick<PoolClient, "query">,
  orgId: string,
  email: string,
  role: "admin" | "member",
  invitedBy: string,
): Promise<{ id: string; raw: string; expiresAt: Date }> {
  const { raw, hash } = createInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO organization_invitations
       (organization_id, email, role, token_hash, status, expires_at, invited_by_user_id)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)
     RETURNING id`,
    [orgId, email, role, hash, expiresAt, invitedBy],
  );
  return { id: rows[0]!.id, raw, expiresAt };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

// ── Platform admin ──────────────────────────────────────────────────────────

// POST /api/admin/organizations
router.post(
  "/admin/organizations",
  ...flagAndAuth,
  requirePlatformAdmin,
  wrap(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body["name"] === "string" ? body["name"].trim() : "";
    if (name.length === 0 || name.length > 200) {
      res.status(400).json({ error: "name must be 1 to 200 characters" });
      return;
    }
    const seatLimit = body["seatLimit"];
    if (!Number.isInteger(seatLimit) || (seatLimit as number) < 0 || (seatLimit as number) > 100000) {
      res.status(400).json({ error: "seatLimit must be an integer from 0 to 100000" });
      return;
    }
    const accessEndsAt = parseFutureDate(body["accessEndsAt"]);
    if (body["accessEndsAt"] !== undefined && body["accessEndsAt"] !== null && accessEndsAt === null) {
      res.status(400).json({ error: "accessEndsAt must be a future ISO date" });
      return;
    }
    let adminEmail: string | null = null;
    if (body["adminEmail"] !== undefined && body["adminEmail"] !== null) {
      adminEmail = normalizeEmail(body["adminEmail"]);
      if (!adminEmail) {
        res.status(400).json({ error: "adminEmail is not a valid address" });
        return;
      }
      if ((seatLimit as number) < 1) {
        res.status(400).json({ error: "seatLimit must be at least 1 to invite an admin" });
        return;
      }
    }

    const actor = (req as AuthedRequest).userId;
    const client = await pool.connect();
    let org: OrgRow;
    let invitation: { id: string; raw: string; expiresAt: Date } | null = null;
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<OrgRow>(
        `INSERT INTO organizations (name, seat_limit, access_ends_at, created_by_user_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, status, seat_limit, access_ends_at, created_at`,
        [name, seatLimit, accessEndsAt ?? null, actor],
      );
      org = rows[0]!;
      if (adminEmail) {
        invitation = await insertInvitation(client, org.id, adminEmail, "admin", actor);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    logger.info({ organizationId: org.id, seatLimit }, "University organization created");
    const emailSent = invitation && adminEmail
      ? await sendOrganizationInvitationEmail({
          to: adminEmail,
          organizationName: org.name,
          inviteUrl: inviteUrlFor(invitation.raw),
          expiresAt: invitation.expiresAt,
        })
      : false;

    res.status(201).json({
      organization: orgDto(org, 0),
      adminInvitation: invitation
        ? {
            id: invitation.id,
            expiresAt: invitation.expiresAt.toISOString(),
            inviteUrl: inviteUrlFor(invitation.raw),
            emailSent,
          }
        : null,
    });
  }),
);

// PATCH /api/admin/organizations/:orgId
router.patch(
  "/admin/organizations/:orgId",
  ...flagAndAuth,
  requirePlatformAdmin,
  wrap(async (req, res) => {
    const orgId = req.params["orgId"];
    if (!isUuid(orgId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;

    let name: string | undefined;
    if (body["name"] !== undefined) {
      name = typeof body["name"] === "string" ? body["name"].trim() : "";
      if (name.length === 0 || name.length > 200) {
        res.status(400).json({ error: "name must be 1 to 200 characters" });
        return;
      }
    }
    let seatLimit: number | undefined;
    if (body["seatLimit"] !== undefined) {
      if (!Number.isInteger(body["seatLimit"]) || (body["seatLimit"] as number) < 0 || (body["seatLimit"] as number) > 100000) {
        res.status(400).json({ error: "seatLimit must be an integer from 0 to 100000" });
        return;
      }
      seatLimit = body["seatLimit"] as number;
    }
    let status: "active" | "suspended" | undefined;
    if (body["status"] !== undefined) {
      if (body["status"] !== "active" && body["status"] !== "suspended") {
        res.status(400).json({ error: "status must be active or suspended" });
        return;
      }
      status = body["status"];
    }
    let accessEndsAt: Date | null | undefined;
    if (body["accessEndsAt"] !== undefined) {
      const parsed = parseFutureDate(body["accessEndsAt"]);
      if (body["accessEndsAt"] !== null && parsed === null) {
        res.status(400).json({ error: "accessEndsAt must be a future ISO date or null" });
        return;
      }
      accessEndsAt = parsed ?? null;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [current] } = await client.query<OrgRow>(
        "SELECT id, name, status, seat_limit, access_ends_at, created_at FROM organizations WHERE id = $1 FOR UPDATE",
        [orgId],
      );
      if (!current) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (seatLimit !== undefined) {
        const active = await countActiveSeats(client, orgId);
        if (seatLimit < active) {
          await client.query("ROLLBACK");
          res.status(409).json({
            error: "seat_limit_below_members",
            message: `Organization has ${active} active members. Seat limit cannot drop below that.`,
          });
          return;
        }
      }
      const { rows: [updated] } = await client.query<OrgRow>(
        `UPDATE organizations
            SET name = $2, status = $3, seat_limit = $4, access_ends_at = $5, updated_at = now()
          WHERE id = $1
          RETURNING id, name, status, seat_limit, access_ends_at, created_at`,
        [
          orgId,
          name ?? current.name,
          status ?? current.status,
          seatLimit ?? current.seat_limit,
          accessEndsAt === undefined ? current.access_ends_at : accessEndsAt,
        ],
      );
      await syncOrganizationEntitlements(client, orgId);
      await client.query("COMMIT");
      const seats = await countActiveSeats(pool, orgId);
      res.json(orgDto(updated!, seats));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ── Organization admin and members ──────────────────────────────────────────

// GET /api/organizations/:orgId
router.get(
  "/organizations/:orgId",
  ...flagAndAuth,
  requireOrgRole("member"),
  wrap(async (req, res) => {
    const ctx = orgContext(res);
    const { rows: [row] } = await pool.query<OrgRow>(
      "SELECT id, name, status, seat_limit, access_ends_at, created_at FROM organizations WHERE id = $1",
      [ctx.organizationId],
    );
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const seats = await countActiveSeats(pool, ctx.organizationId);
    res.json({ ...orgDto(row, seats), role: ctx.role });
  }),
);

// GET /api/organizations/:orgId/members (no emails or Clerk IDs returned)
router.get(
  "/organizations/:orgId/members",
  ...flagAndAuth,
  requireOrgRole("admin"),
  wrap(async (req, res) => {
    const { organizationId } = orgContext(res);
    const { rows } = await pool.query(
      `SELECT id, role, status, created_at, revoked_at
         FROM organization_members
        WHERE organization_id = $1
        ORDER BY created_at ASC`,
      [organizationId],
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        role: r.role,
        status: r.status,
        createdAt: r.created_at,
        revokedAt: r.revoked_at,
      })),
    );
  }),
);

// POST /api/organizations/:orgId/members/:memberId/revoke
router.post(
  "/organizations/:orgId/members/:memberId/revoke",
  ...flagAndAuth,
  requireOrgRole("admin"),
  wrap(async (req, res) => {
    const { organizationId } = orgContext(res);
    const memberId = req.params["memberId"];
    if (!isUuid(memberId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Lock the organization first. Every mutation uses this order.
      await client.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [organizationId]);
      const { rows: [member] } = await client.query<{ id: string; role: string; status: string }>(
        "SELECT id, role, status FROM organization_members WHERE id = $1 AND organization_id = $2 FOR UPDATE",
        [memberId, organizationId],
      );
      if (!member) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (member.status === "revoked") {
        await client.query("COMMIT");
        res.json({ id: member.id, status: "revoked" });
        return;
      }
      if (member.role === "admin") {
        const { rows: [{ n }] } = await client.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM organization_members
            WHERE organization_id = $1 AND role = 'admin' AND status = 'active'`,
          [organizationId],
        );
        if (parseInt(n, 10) <= 1) {
          await client.query("ROLLBACK");
          res.status(409).json({ error: "last_admin", message: "An organization must keep at least one active admin." });
          return;
        }
      }
      await client.query(
        "UPDATE organization_members SET status = 'revoked', revoked_at = now() WHERE id = $1",
        [memberId],
      );
      await syncOrganizationEntitlements(client, organizationId);
      await client.query("COMMIT");
      res.json({ id: memberId, status: "revoked" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ── Organization admin: invitations ─────────────────────────────────────────

// POST /api/organizations/:orgId/invitations
router.post(
  "/organizations/:orgId/invitations",
  ...flagAndAuth,
  requireOrgRole("admin"),
  wrap(async (req, res) => {
    const { organizationId } = orgContext(res);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = normalizeEmail(body["email"]);
    if (!email) {
      res.status(400).json({ error: "email is not a valid address" });
      return;
    }
    const role = body["role"] === undefined ? "member" : body["role"];
    if (role !== "member" && role !== "admin") {
      res.status(400).json({ error: "role must be member or admin" });
      return;
    }
    const actor = (req as AuthedRequest).userId;

    const client = await pool.connect();
    let invitation: { id: string; raw: string; expiresAt: Date };
    let orgName: string;
    try {
      await client.query("BEGIN");
      const { rows: [org] } = await client.query<OrgRow>(
        "SELECT id, name, status, seat_limit, access_ends_at, created_at FROM organizations WHERE id = $1 FOR UPDATE",
        [organizationId],
      );
      if (!org || org.status !== "active") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "organization_inactive" });
        return;
      }
      orgName = org.name;
      try {
        invitation = await insertInvitation(client, organizationId, email, role, actor);
      } catch (err) {
        await client.query("ROLLBACK");
        if (isUniqueViolation(err)) {
          res.status(409).json({ error: "invitation_pending", message: "A live invitation already exists for this address." });
          return;
        }
        throw err;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    const emailSent = await sendOrganizationInvitationEmail({
      to: email,
      organizationName: orgName,
      inviteUrl: inviteUrlFor(invitation.raw),
      expiresAt: invitation.expiresAt,
    });
    res.status(201).json({
      id: invitation.id,
      email: maskEmail(email),
      role,
      status: "pending",
      expiresAt: invitation.expiresAt.toISOString(),
      // Shown once. The server keeps only the hash, so this cannot be recovered later.
      inviteUrl: inviteUrlFor(invitation.raw),
      emailSent,
    });
  }),
);

// GET /api/organizations/:orgId/invitations
router.get(
  "/organizations/:orgId/invitations",
  ...flagAndAuth,
  requireOrgRole("admin"),
  wrap(async (req, res) => {
    const { organizationId } = orgContext(res);
    const { rows } = await pool.query(
      `SELECT id, email, role, expires_at, created_at, accepted_at,
              CASE WHEN status = 'pending' AND expires_at <= now() THEN 'expired' ELSE status END AS status
         FROM organization_invitations
        WHERE organization_id = $1
        ORDER BY created_at DESC`,
      [organizationId],
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        email: maskEmail(r.email),
        role: r.role,
        status: r.status,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        acceptedAt: r.accepted_at,
      })),
    );
  }),
);

// POST /api/organizations/:orgId/invitations/:inviteId/revoke
router.post(
  "/organizations/:orgId/invitations/:inviteId/revoke",
  ...flagAndAuth,
  requireOrgRole("admin"),
  wrap(async (req, res) => {
    const { organizationId } = orgContext(res);
    const inviteId = req.params["inviteId"];
    if (!isUuid(inviteId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [organizationId]);
      const { rows } = await client.query<{ status: string }>(
        `UPDATE organization_invitations SET status = 'revoked'
          WHERE id = $1 AND organization_id = $2 AND status = 'pending'
          RETURNING status`,
        [inviteId, organizationId],
      );
      if (rows.length === 0) {
        const { rows: [current] } = await client.query<{ status: string }>(
          "SELECT status FROM organization_invitations WHERE id = $1 AND organization_id = $2",
          [inviteId, organizationId],
        );
        await client.query("ROLLBACK");
        if (!current) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        if (current.status === "revoked") {
          res.json({ id: inviteId, status: "revoked" });
          return;
        }
        res.status(409).json({ error: "not_pending", status: current.status });
        return;
      }
      await client.query("COMMIT");
      res.json({ id: inviteId, status: "revoked" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }),
);

// POST /api/organizations/:orgId/invitations/:inviteId/resend
// Rotates the token and resets expiry. The previous link stops working at once.
router.post(
  "/organizations/:orgId/invitations/:inviteId/resend",
  ...flagAndAuth,
  requireOrgRole("admin"),
  wrap(async (req, res) => {
    const { organizationId } = orgContext(res);
    const inviteId = req.params["inviteId"];
    if (!isUuid(inviteId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const client = await pool.connect();
    let raw: string;
    let expiresAt: Date;
    let email: string;
    let orgName: string;
    try {
      await client.query("BEGIN");
      const { rows: [org] } = await client.query<{ name: string; status: string }>(
        "SELECT name, status FROM organizations WHERE id = $1 FOR UPDATE",
        [organizationId],
      );
      if (!org || org.status !== "active") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "organization_inactive" });
        return;
      }
      orgName = org.name;
      const token = createInviteToken();
      expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const { rows } = await client.query<{ email: string }>(
        `UPDATE organization_invitations
            SET token_hash = $3, expires_at = $4
          WHERE id = $1 AND organization_id = $2 AND status = 'pending'
          RETURNING email`,
        [inviteId, organizationId, token.hash, expiresAt],
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "not_pending" });
        return;
      }
      email = rows[0]!.email;
      raw = token.raw;
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    const emailSent = await sendOrganizationInvitationEmail({
      to: email,
      organizationName: orgName,
      inviteUrl: inviteUrlFor(raw),
      expiresAt,
    });
    res.json({
      id: inviteId,
      status: "pending",
      expiresAt: expiresAt.toISOString(),
      inviteUrl: inviteUrlFor(raw),
      emailSent,
    });
  }),
);

// ── Student: invitation preview and accept ──────────────────────────────────

interface InviteLookup {
  organization_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: Date;
  org_name: string;
  org_status: string;
  access_ends_at: Date | null;
}

async function lookupInvitation(db: Pick<PoolClient, "query"> | typeof pool, hash: string) {
  const { rows } = await db.query<InviteLookup>(
    `SELECT i.organization_id, i.email, i.role, i.status, i.expires_at,
            o.name AS org_name, o.status AS org_status, o.access_ends_at
       FROM organization_invitations i
       JOIN organizations o ON o.id = i.organization_id
      WHERE i.token_hash = $1`,
    [hash],
  );
  return rows[0];
}

// POST /api/invitations/preview   body: { token }
router.post(
  "/invitations/preview",
  ...flagAndAuth,
  inviteLimiter,
  wrap(async (req, res) => {
    const token = (req.body as Record<string, unknown> | undefined)?.["token"];
    if (!isWellFormedToken(token)) {
      res.status(404).json({ error: "invitation_not_found" });
      return;
    }
    const inv = await lookupInvitation(pool, hashToken(token));
    if (!inv) {
      res.status(404).json({ error: "invitation_not_found" });
      return;
    }
    if (inv.status !== "pending" || inv.expires_at <= new Date()) {
      res.status(410).json({ error: inv.status === "accepted" ? "already_used" : "invitation_unavailable", code: inv.status });
      return;
    }
    if (inv.org_status !== "active") {
      res.status(410).json({ error: "organization_inactive" });
      return;
    }
    res.json({
      organizationName: inv.org_name,
      role: inv.role,
      emailHint: maskEmail(inv.email),
      expiresAt: inv.expires_at.toISOString(),
    });
  }),
);

// POST /api/invitations/accept   body: { token }
router.post(
  "/invitations/accept",
  ...flagAndAuth,
  inviteLimiter,
  wrap(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const token = (req.body as Record<string, unknown> | undefined)?.["token"];
    if (!isWellFormedToken(token)) {
      res.status(404).json({ error: "invitation_not_found" });
      return;
    }

    // Identity check happens outside the transaction: no network call while
    // rows are locked.
    let clerkEmail: string | null;
    try {
      clerkEmail = await verifiedPrimaryEmail(userId);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.name : "unknown" }, "Clerk user lookup failed during invitation accept");
      res.status(503).json({ error: "identity_unavailable" });
      return;
    }
    if (!clerkEmail) {
      res.status(403).json({ error: "email_not_verified" });
      return;
    }

    const hash = hashToken(token);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const pre = await lookupInvitation(client, hash);
      if (!pre) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "invitation_not_found" });
        return;
      }
      // Lock order: organization, then invitation, then membership.
      const { rows: [org] } = await client.query<{
        id: string; name: string; status: string; seat_limit: number; access_ends_at: Date | null;
      }>(
        "SELECT id, name, status, seat_limit, access_ends_at FROM organizations WHERE id = $1 FOR UPDATE",
        [pre.organization_id],
      );
      const { rows: [inv] } = await client.query<{
        id: string; email: string; role: "admin" | "member"; status: string;
        expires_at: Date; accepted_by_user_id: string | null;
      }>(
        `SELECT id, email, role, status, expires_at, accepted_by_user_id
           FROM organization_invitations WHERE token_hash = $1 FOR UPDATE`,
        [hash],
      );
      const { rows: [member] } = await client.query<{ id: string; role: string; status: string }>(
        "SELECT id, role, status FROM organization_members WHERE organization_id = $1 AND user_id = $2 FOR UPDATE",
        [pre.organization_id, userId],
      );
      const alreadyActive = member?.status === "active";

      // Idempotent: the same user re-submitting an invite they already used,
      // while still an active member, succeeds without changing anything.
      if (inv!.status === "accepted" && inv!.accepted_by_user_id === userId && alreadyActive) {
        await client.query("COMMIT");
        res.json({
          organizationName: org!.name,
          role: member!.role,
          accessEndsAt: org!.access_ends_at ? org!.access_ends_at.toISOString() : null,
        });
        return;
      }
      if (inv!.status !== "pending") {
        await client.query("ROLLBACK");
        res.status(410).json({ error: inv!.status === "accepted" ? "already_used" : "invitation_unavailable", code: inv!.status });
        return;
      }
      if (inv!.expires_at <= new Date()) {
        await client.query("UPDATE organization_invitations SET status = 'expired' WHERE id = $1", [inv!.id]);
        await client.query("COMMIT");
        res.status(410).json({ error: "invitation_expired", code: "expired" });
        return;
      }
      if (clerkEmail !== inv!.email) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "email_mismatch", message: "This invitation was sent to a different email address. Sign in with that address." });
        return;
      }
      if (org!.status !== "active" || (org!.access_ends_at && org!.access_ends_at <= new Date())) {
        await client.query("ROLLBACK");
        res.status(410).json({ error: "organization_inactive" });
        return;
      }

      let resultingRole: string = member?.role ?? inv!.role;
      if (!alreadyActive) {
        const seats = await countActiveSeats(client, org!.id);
        if (seats >= org!.seat_limit) {
          await client.query("ROLLBACK");
          res.status(409).json({ error: "seats_full", message: `${org!.name} has no open seats. Ask your administrator.` });
          return;
        }
        // Re-activates a previously revoked row, or creates one. The
        // invitation's role decides the role. The old role does not carry over.
        const { rows: [upserted] } = await client.query<{ role: string }>(
          `INSERT INTO organization_members (organization_id, user_id, role, status)
           VALUES ($1, $2, $3, 'active')
           ON CONFLICT (organization_id, user_id)
           DO UPDATE SET status = 'active', role = EXCLUDED.role, revoked_at = NULL
           RETURNING role`,
          [org!.id, userId, inv!.role],
        );
        resultingRole = upserted!.role;
      }

      await syncOrganizationEntitlements(client, org!.id);
      await client.query(
        "UPDATE organization_invitations SET status = 'accepted', accepted_by_user_id = $2, accepted_at = now() WHERE id = $1",
        [inv!.id, userId],
      );
      await client.query("COMMIT");

      logger.info({ organizationId: org!.id, role: resultingRole }, "University invitation accepted");
      res.json({
        organizationName: org!.name,
        role: resultingRole,
        accessEndsAt: org!.access_ends_at ? org!.access_ends_at.toISOString() : null,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ── Student: entitlement read ───────────────────────────────────────────────

// GET /api/entitlements/me
router.get(
  "/entitlements/me",
  ...flagAndAuth,
  wrap(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const university = await universityEntitlementFor(userId);
    res.json({ university });
  }),
);

export default router;
