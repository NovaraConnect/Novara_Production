// ============================================================================
// Organization-scoped authorization.
//
// Every org route runs through requireOrgRole. Non-members get 404 for any
// org ID, so organization IDs cannot be probed. A member without the required
// role gets 403. Membership is always checked against the org named in the
// URL, so an admin of org A cannot act on org B.
// ============================================================================
import type { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import type { AuthedRequest } from "../middlewares/auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export interface OrgContext {
  organizationId: string;
  role: "admin" | "member";
}

export function requireOrgRole(required: "member" | "admin") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const orgId = req.params["orgId"];
    const userId = (req as AuthedRequest).userId;
    if (!isUuid(orgId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      const { rows } = await pool.query<{ role: "admin" | "member" }>(
        `SELECT m.role
           FROM organization_members m
          WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active'`,
        [orgId, userId],
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (required === "admin" && row.role !== "admin") {
        res.status(403).json({ error: "Organization admin required" });
        return;
      }
      res.locals["org"] = { organizationId: orgId, role: row.role } satisfies OrgContext;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function orgContext(res: Response): OrgContext {
  return res.locals["org"] as OrgContext;
}
