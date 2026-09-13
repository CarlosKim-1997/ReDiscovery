import { externalSubjectSchema, identityIdSchema, type Account } from "@/domain/identity/account";
import type { AccountStorePort } from "@/ports/account-store";
import type { ClockPort } from "@/ports/clock";

interface IdentityDependencies { readonly store: AccountStorePort; readonly clock: ClockPort }

// Service-only boundary. A trusted upstream authentication context must supply
// the subject/account in M6-B. Never expose this as client-asserted authentication.
export function resolveAuthenticatedAccount(deps: IdentityDependencies, externalSubject: string): Promise<Account> {
  return deps.store.resolveAccount(externalSubjectSchema.parse(externalSubject), deps.clock.now());
}

export function claimCurrentOfficialSession(deps: IdentityDependencies, authenticatedAccount: Account, currentSessionId: string, currentAnonymousDevice: string) {
  return deps.store.claimOfficialSession({
    accountId: identityIdSchema.parse(authenticatedAccount.id),
    sessionId: identityIdSchema.parse(currentSessionId),
    deviceId: identityIdSchema.parse(currentAnonymousDevice),
    claimedAt: deps.clock.now(),
  });
}
