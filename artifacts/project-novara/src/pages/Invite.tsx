// ============================================================================
// Accepts a university invitation. Reached from the link in the invite email.
//
// Renders outside the app shell (like /welcome), so the native tab bar is
// hidden. Renders NotFound unless the web build has VITE_UNIVERSITY_ACCESS=true.
// ============================================================================
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth, SignIn } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import {
  captureTokenFromHash,
  clearPendingInvite,
  readPendingInvite,
  universityUiEnabled,
} from "@/lib/pendingInvite";
import {
  acceptInvitation,
  previewInvitation,
  UniversityApiError,
  type InvitePreview,
} from "@/lib/universityApi";
import { ENTITLEMENT_KEY } from "@/hooks/useUniversityEntitlement";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MESSAGES: Record<string, string> = {
  email_not_verified: "Verify your email address in your account settings, then try again.",
  email_mismatch: "This invitation was sent to a different email address. Sign out, then sign in with that address.",
  invitation_expired: "This invitation has expired. Ask your administrator for a new one.",
  invitation_unavailable: "This invitation is no longer valid. Ask your administrator for a new one.",
  already_used: "This invitation has already been used.",
  organization_inactive: "This organization's access is not active right now.",
  invitation_not_found: "We could not find this invitation. Check the link, or ask your administrator to send a new one.",
  identity_unavailable: "We could not check your account just now. Try again in a moment.",
};

/** Codes after which the stored token can never work again, so it is dropped. */
const TERMINAL = new Set(["invitation_not_found", "invitation_expired", "invitation_unavailable", "already_used", "organization_inactive"]);

function messageFor(err: unknown): string {
  if (err instanceof UniversityApiError) {
    return MESSAGES[err.code] ?? "Something went wrong. Try again.";
  }
  return "Couldn't reach Novara. Check your connection and try again.";
}

export default function Invite() {
  if (!universityUiEnabled()) return <NotFound />;
  return <InviteFlow />;
}

function InviteFlow() {
  const [, setLocation] = useLocation();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  // Take the token out of the fragment once, on first render, then keep it in
  // session storage. The fragment is never sent to the server.
  const [token] = useState<string | null>(() => captureTokenFromHash() ?? readPendingInvite());

  const preview = useQuery<InvitePreview, Error>({
    queryKey: ["invitation-preview", token],
    queryFn: () => previewInvitation(getToken, token!),
    enabled: isLoaded && !!isSignedIn && !!token,
    retry: false,
  });

  useEffect(() => {
    if (preview.error instanceof UniversityApiError && TERMINAL.has(preview.error.code)) {
      clearPendingInvite();
    }
  }, [preview.error]);

  const accept = useMutation({
    mutationFn: () => acceptInvitation(getToken, token!),
    onSuccess: async (result) => {
      clearPendingInvite();
      await queryClient.invalidateQueries({ queryKey: ENTITLEMENT_KEY });
      toast.success(`Welcome to ${result.organizationName}.`);
      setLocation("/dashboard");
    },
    onError: (err) => {
      if (err instanceof UniversityApiError && TERMINAL.has(err.code)) clearPendingInvite();
      toast.error(messageFor(err));
    },
  });

  if (!isLoaded) return <Shell><p className="text-sm text-muted-foreground">Loading…</p></Shell>;

  if (!isSignedIn) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-foreground mb-2">Accept your invitation</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Sign in with the email address this invitation was sent to.
        </p>
        <SignIn
          routing="path"
          path={`${basePath}/invite`}
          signUpUrl={`${basePath}/sign-up`}
          forceRedirectUrl={`${basePath}/invite`}
        />
      </Shell>
    );
  }

  if (!token) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-foreground mb-2">This link is incomplete</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Open the link from your invitation email again. If it still does not work, ask your administrator to send a new one.
        </p>
        <Button variant="outline" onClick={() => setLocation("/dashboard")}>Go to dashboard</Button>
      </Shell>
    );
  }

  if (preview.isLoading) return <Shell><p className="text-sm text-muted-foreground">Checking your invitation…</p></Shell>;

  if (preview.error) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-foreground mb-2">Invitation unavailable</h1>
        <p className="text-sm text-muted-foreground mb-6">{messageFor(preview.error)}</p>
        <Button variant="outline" onClick={() => setLocation("/dashboard")}>Go to dashboard</Button>
      </Shell>
    );
  }

  const info = preview.data!;
  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Invitation</p>
      <h1 className="text-xl font-bold text-foreground mb-2">Join {info.organizationName}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Accepting gives you access to Novara through {info.organizationName}. There is nothing to pay.
      </p>
      <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate()}>
        {accept.isPending ? "Accepting…" : "Accept invitation"}
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md surface-card p-6">{children}</div>
    </div>
  );
}
