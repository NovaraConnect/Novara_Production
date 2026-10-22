// ============================================================================
// Settings → Organization. Shown only when BOTH gates are on:
//   build: VITE_UNIVERSITY_ACCESS=true, server: features.universityAccess.
// Members see their organization. Admins also manage invitations and members
// within that one organization. Nothing here shows a price or a payment.
// ============================================================================
import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeatures } from "@/hooks/useFeatures";
import { useUniversityEntitlement, ENTITLEMENT_KEY } from "@/hooks/useUniversityEntitlement";
import { universityUiEnabled } from "@/lib/pendingInvite";
import {
  createInvitation,
  fetchInvitations,
  fetchMembers,
  fetchOrganization,
  resendInvitation,
  revokeInvitation,
  revokeMember,
  type CreatedInvitation,
} from "@/lib/universityApi";

export function OrganizationSection() {
  const { universityAccess } = useFeatures();
  const enabled = universityUiEnabled() && universityAccess;
  const { entitlement, active } = useUniversityEntitlement();
  if (!enabled || !active || !entitlement?.organizationId) return null;
  return <OrganizationPanel orgId={entitlement.organizationId} />;
}

function OrganizationPanel({ orgId }: { orgId: string }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const org = useQuery({ queryKey: ["org", orgId], queryFn: () => fetchOrganization(getToken, orgId) });
  const isAdmin = org.data?.role === "admin";

  const members = useQuery({
    queryKey: ["org", orgId, "members"],
    queryFn: () => fetchMembers(getToken, orgId),
    enabled: isAdmin,
  });
  const invitations = useQuery({
    queryKey: ["org", orgId, "invitations"],
    queryFn: () => fetchInvitations(getToken, orgId),
    enabled: isAdmin,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["org", orgId] });
    queryClient.invalidateQueries({ queryKey: ENTITLEMENT_KEY });
  };

  return (
    <section id="organization" className="scroll-mt-24">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Organization</p>
      <div className="surface-card p-5 space-y-5">
        {org.data && (
          <div>
            <p className="text-base font-semibold text-foreground">{org.data.name}</p>
            <p className="text-xs text-muted-foreground">
              {org.data.accessEndsAt
                ? `Access through ${new Date(org.data.accessEndsAt).toLocaleDateString()}`
                : "Access is active"}
            </p>
          </div>
        )}

        {isAdmin && (
          <>
            <InviteForm orgId={orgId} onDone={refresh} />
            <InvitationList orgId={orgId} rows={invitations.data ?? []} onChange={refresh} />
            <MemberList orgId={orgId} rows={members.data ?? []} onChange={refresh} />
          </>
        )}
      </div>
    </section>
  );
}

function InviteForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const { getToken } = useAuth();
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const create = useMutation({
    mutationFn: () => createInvitation(getToken, orgId, email.trim(), "member"),
    onSuccess: (result) => {
      setCreated(result);
      setEmail("");
      onDone();
      toast.success(result.emailSent ? "Invitation sent." : "Invitation created. Copy the link to share it.");
    },
    onError: () => toast.error("Could not create the invitation."),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">Invite a student</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) create.mutate();
        }}
      >
        <Input type="email" placeholder="name@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Button type="submit" disabled={create.isPending || !email.trim()}>Invite</Button>
      </form>
      {created && (
        <div className="rounded-md border border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            {created.emailSent ? "Email sent. " : "Email not sent. "}
            This link is shown once. Copy it now if you need to share it yourself.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={created.inviteUrl} onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="outline"
              onClick={() => navigator.clipboard?.writeText(created.inviteUrl).then(() => toast.success("Link copied."))}
            >
              Copy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InvitationList({
  orgId,
  rows,
  onChange,
}: {
  orgId: string;
  rows: { id: string; email: string; role: string; status: string; expiresAt: string }[];
  onChange: () => void;
}) {
  const { getToken } = useAuth();
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvitation(getToken, orgId, id),
    onSuccess: () => { toast.success("Invitation revoked."); onChange(); },
    onError: () => toast.error("Could not revoke the invitation."),
  });
  const resend = useMutation({
    mutationFn: (id: string) => resendInvitation(getToken, orgId, id),
    onSuccess: (result) => {
      setLinkFor(result.inviteUrl);
      toast.success(result.emailSent ? "Invitation resent." : "New link created. Copy it to share.");
      onChange();
    },
    onError: () => toast.error("Could not resend the invitation."),
  });

  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Invitations</p>
      {linkFor && (
        <div className="flex gap-2">
          <Input readOnly value={linkFor} onFocus={(e) => e.currentTarget.select()} />
          <Button variant="outline" onClick={() => navigator.clipboard?.writeText(linkFor)}>Copy</Button>
        </div>
      )}
      <ul className="divide-y divide-border text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block truncate text-foreground">{row.email}</span>
              <span className="text-xs text-muted-foreground capitalize">{row.status} · {row.role}</span>
            </span>
            {row.status === "pending" && (
              <span className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => resend.mutate(row.id)} disabled={resend.isPending}>Resend</Button>
                <Button size="sm" variant="outline" onClick={() => revoke.mutate(row.id)} disabled={revoke.isPending}>Revoke</Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemberList({
  orgId,
  rows,
  onChange,
}: {
  orgId: string;
  rows: { id: string; role: string; status: string }[];
  onChange: () => void;
}) {
  const { getToken } = useAuth();
  const remove = useMutation({
    mutationFn: (id: string) => revokeMember(getToken, orgId, id),
    onSuccess: () => { toast.success("Access removed."); onChange(); },
    onError: (err: Error) =>
      toast.error(err.message === "last_admin" ? "An organization must keep at least one admin." : "Could not remove access."),
  });
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Members</p>
      <ul className="divide-y divide-border text-sm">
        {rows.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-2">
            <span className="text-foreground capitalize">{m.role} · <span className="text-muted-foreground">{m.status}</span></span>
            {m.status === "active" && (
              <Button size="sm" variant="outline" onClick={() => remove.mutate(m.id)} disabled={remove.isPending}>Remove</Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
