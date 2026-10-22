// ============================================================================
// Entitlement checks and sync.
//
// Authority: university access is decided at READ time from membership,
// organization status and the optional contract end date. The `entitlements`
// rows are a provider-neutral record that is kept in sync inside the same
// transaction as every change. A stale row can never grant access on its own.
// ============================================================================
import type { Pool, PoolClient } from "pg";
import { pool } from "../db";
import { universityAccessEnabled } from "./flags";

/** Novara Free ceiling for contacts. Lifted only by an active university entitlement. */
export const FREE_TIER_LIMIT = 6;

type Queryable = Pick<Pool | PoolClient, "query">;

export interface UniversityEntitlement {
  active: boolean;
  organizationId?: string;
  organizationName?: string;
  role?: "admin" | "member";
  accessEndsAt?: string | null;
}

/** SQL fragment: an active membership in an active, unexpired organization.
 *  Shared by the read-time check and the sync so they can never disagree. */
const ACTIVE_ACCESS_SQL = `
  m.status = 'active'
  AND o.status = 'active'
  AND (o.access_ends_at IS NULL OR o.access_ends_at > now())
`;

export async function universityEntitlementFor(
  userId: string,
  db: Queryable = pool,
): Promise<UniversityEntitlement> {
  const { rows } = await db.query<{
    organization_id: string;
    name: string;
    role: "admin" | "member";
    access_ends_at: Date | null;
  }>(
    `SELECT o.id AS organization_id, o.name, m.role, o.access_ends_at
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1 AND ${ACTIVE_ACCESS_SQL}
      ORDER BY o.created_at ASC
      LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return { active: false };
  return {
    active: true,
    organizationId: row.organization_id,
    organizationName: row.name,
    role: row.role,
    accessEndsAt: row.access_ends_at ? row.access_ends_at.toISOString() : null,
  };
}

/**
 * Contact ceiling for a user. With the feature off this is exactly the
 * existing free limit and makes no database call, so behaviour is unchanged.
 */
export async function contactLimitFor(userId: string): Promise<number> {
  if (!universityAccessEnabled()) return FREE_TIER_LIMIT;
  const ent = await universityEntitlementFor(userId);
  return ent.active ? Number.POSITIVE_INFINITY : FREE_TIER_LIMIT;
}

/**
 * Brings the university `entitlements` rows for every member of one
 * organization in line with the current membership and organization state.
 * Call inside the same transaction as the change that caused it.
 */
export async function syncOrganizationEntitlements(db: Queryable, organizationId: string): Promise<void> {
  await db.query(
    `INSERT INTO entitlements (user_id, source, organization_id, status, updated_at)
     SELECT m.user_id, 'university', m.organization_id,
            CASE WHEN ${ACTIVE_ACCESS_SQL} THEN 'active' ELSE 'inactive' END,
            now()
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
      WHERE m.organization_id = $1
     ON CONFLICT (user_id, organization_id) WHERE source = 'university'
     DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
    [organizationId],
  );
}
