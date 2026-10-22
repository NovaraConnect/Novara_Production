// If an invitation token was stored in this tab (for example the visitor signed
// up from the invite page and was sent to the dashboard), bring them back to
// /invite so they can finish accepting. Does nothing unless both gates are on.
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { readPendingInvite, universityUiEnabled } from "@/lib/pendingInvite";

export function PendingInviteRedirect() {
  const [location, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!universityUiEnabled() || !isLoaded || !isSignedIn) return;
    if (location === "/invite") return;
    if (readPendingInvite()) setLocation("/invite");
  }, [location, isLoaded, isSignedIn, setLocation]);

  return null;
}
