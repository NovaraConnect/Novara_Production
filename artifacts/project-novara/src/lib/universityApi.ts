// Client calls for university access. Tokens go only in request bodies.
import { apiFetch, type GetAuthToken } from "./api";

export class UniversityApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function ensureOk<T>(res: Response, fallbackCode: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let code = fallbackCode;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string") code = body.error;
  } catch {
    // Non-JSON error body. Keep the fallback code.
  }
  throw new UniversityApiError(res.status, code);
}

export interface Entitlement {
  active: boolean;
  organizationId?: string;
  organizationName?: string;
  role?: "admin" | "member";
  accessEndsAt?: string | null;
}

export interface InvitePreview {
  organizationName: string;
  role: "admin" | "member";
  emailHint: string;
  expiresAt: string;
}

export interface OrganizationDetail {
  id: string;
  name: string;
  status: string;
  /** Active members. For reporting only. Not a cap and not shown as "seats". */
  memberCount: number;
  accessEndsAt: string | null;
  role: "admin" | "member";
}

export interface InvitationRow {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  acceptedAt: string | null;
}

export interface MemberRow {
  id: string;
  role: "admin" | "member";
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
}

export interface CreatedInvitation {
  id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  expiresAt: string;
  inviteUrl: string;
  emailSent: boolean;
}

export async function fetchEntitlement(getToken: GetAuthToken): Promise<Entitlement> {
  const res = await apiFetch(getToken, "/api/entitlements/me");
  const body = await ensureOk<{ university: Entitlement }>(res, "entitlement_unavailable");
  return body.university;
}

export async function previewInvitation(getToken: GetAuthToken, token: string): Promise<InvitePreview> {
  const res = await apiFetch(getToken, "/api/invitations/preview", { method: "POST", json: { token } });
  return ensureOk<InvitePreview>(res, "invitation_unavailable");
}

export async function acceptInvitation(
  getToken: GetAuthToken,
  token: string,
): Promise<{ organizationName: string; role: string; accessEndsAt: string | null }> {
  const res = await apiFetch(getToken, "/api/invitations/accept", { method: "POST", json: { token } });
  return ensureOk(res, "invitation_unavailable");
}

// ── Organization admin ──────────────────────────────────────────────────────

export async function fetchOrganization(getToken: GetAuthToken, orgId: string): Promise<OrganizationDetail> {
  return ensureOk(await apiFetch(getToken, `/api/organizations/${orgId}`), "organization_unavailable");
}

export async function fetchMembers(getToken: GetAuthToken, orgId: string): Promise<MemberRow[]> {
  return ensureOk(await apiFetch(getToken, `/api/organizations/${orgId}/members`), "members_unavailable");
}

export async function fetchInvitations(getToken: GetAuthToken, orgId: string): Promise<InvitationRow[]> {
  return ensureOk(await apiFetch(getToken, `/api/organizations/${orgId}/invitations`), "invitations_unavailable");
}

export async function createInvitation(
  getToken: GetAuthToken,
  orgId: string,
  email: string,
  role: "member" | "admin",
): Promise<CreatedInvitation> {
  const res = await apiFetch(getToken, `/api/organizations/${orgId}/invitations`, {
    method: "POST",
    json: { email, role },
  });
  return ensureOk(res, "invitation_failed");
}

export async function revokeInvitation(getToken: GetAuthToken, orgId: string, inviteId: string): Promise<void> {
  await ensureOk(
    await apiFetch(getToken, `/api/organizations/${orgId}/invitations/${inviteId}/revoke`, { method: "POST" }),
    "revoke_failed",
  );
}

export async function resendInvitation(
  getToken: GetAuthToken,
  orgId: string,
  inviteId: string,
): Promise<CreatedInvitation> {
  return ensureOk(
    await apiFetch(getToken, `/api/organizations/${orgId}/invitations/${inviteId}/resend`, { method: "POST" }),
    "resend_failed",
  );
}

export async function revokeMember(getToken: GetAuthToken, orgId: string, memberId: string): Promise<void> {
  await ensureOk(
    await apiFetch(getToken, `/api/organizations/${orgId}/members/${memberId}/revoke`, { method: "POST" }),
    "revoke_failed",
  );
}
