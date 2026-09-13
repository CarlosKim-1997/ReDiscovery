import type { Account, SessionClaimResult } from "@/domain/identity/account";

// Narrow primary-persistence capability; independent of upstream auth vendors.
export interface AccountStorePort {
  findAccountByExternalSubject(externalSubject: string): Promise<Account | undefined>;
  resolveAccount(externalSubject: string, at: Date): Promise<Account>;
  claimOfficialSession(input: { readonly accountId: string; readonly sessionId: string; readonly deviceId: string; readonly claimedAt: Date }): Promise<SessionClaimResult>;
}
