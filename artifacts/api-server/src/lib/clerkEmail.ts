// ============================================================================
// Reads the signed-in user's PRIMARY email from Clerk, and only if verified.
//
// Invitations are bound to an email address. Accepting requires proof that
// the signed-in account controls that address, and Clerk's verification
// status is the only source for that proof.
// ============================================================================
import { clerkClient } from "@clerk/express";
import { normalizeEmail } from "./invitations";

interface ClerkEmailLike {
  emailAddress?: string;
  verification?: { status?: string } | null;
}

export async function verifiedPrimaryEmail(userId: string): Promise<string | null> {
  const user = (await clerkClient.users.getUser(userId)) as unknown as
    | { primaryEmailAddress?: ClerkEmailLike | null }
    | null
    | undefined;
  const primary = user?.primaryEmailAddress;
  if (!primary || primary.verification?.status !== "verified") return null;
  return normalizeEmail(primary.emailAddress);
}
