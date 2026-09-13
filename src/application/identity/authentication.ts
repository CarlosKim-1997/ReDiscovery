import { identityIdSchema } from "@/domain/identity/account";
import { claimCurrentOfficialSession, resolveAuthenticatedAccount } from "./session-claim";
import type { AccountStorePort } from "@/ports/account-store";
import type { PrimaryStorePort } from "@/ports/primary-store";
import type { ClockPort } from "@/ports/clock";
import type { TrustedAuthPort } from "@/ports/trusted-auth";

export interface AuthenticationDependencies {
  readonly auth: TrustedAuthPort;
  readonly store: AccountStorePort & Pick<PrimaryStorePort, "getOwnedSession">;
  readonly clock: ClockPort;
}
export const optionalCurrentSessionId = (value: string | null) => identityIdSchema.safeParse(value);

export async function authenticatedAccount(deps: AuthenticationDependencies) {
  const identity = await deps.auth.getIdentity();
  return identity ? resolveAuthenticatedAccount(deps, identity.externalSubject) : undefined;
}

export async function validateClaimIntent(deps: AuthenticationDependencies, sessionId: string, deviceId: string) {
  const id = identityIdSchema.parse(sessionId);
  const session = await deps.store.getOwnedSession(id, deviceId);
  if (!session) throw new Error("INVALID_CURRENT_SESSION");
  if (session.attemptType !== "OFFICIAL") throw new Error("NOT_OFFICIAL");
  return id;
}

export async function completeAuthentication(deps: AuthenticationDependencies, code: string | undefined, pendingSessionId: string | undefined, deviceId: string | undefined) {
  if (pendingSessionId && !code) throw new Error("AUTH_CODE_REQUIRED");
  if (code) {
    try { await deps.auth.exchangeCode(code); }
    catch (error) {
      // A consumed-code revisit may keep the verified existing login, but may
      // never apply a still-pending claim without successful code exchange.
      if (pendingSessionId) throw error;
    }
  }
  const account = await authenticatedAccount(deps);
  if (!account) throw new Error("UNAUTHENTICATED");
  if (!pendingSessionId) return { destination: "/", claimApplied: false, claimRequested: false };
  if (!deviceId) return { destination: "/", claimApplied: false, claimRequested: true };
  // Authentication success is not undone by claim rejection. No fallback/history.
  try {
    const result = await claimCurrentOfficialSession(deps, account, pendingSessionId, deviceId);
    const applied = result.kind === "CLAIMED" || result.kind === "ALREADY_CLAIMED_BY_ACCOUNT";
    const session = await deps.store.getOwnedSession(pendingSessionId, deviceId);
    return { destination: session ? `/${session.status === "REVEALED" ? "result" : "play"}/${session.id}` : "/", claimApplied: applied, claimRequested: true };
  } catch {
    return { destination: "/", claimApplied: false, claimRequested: true };
  }
}
