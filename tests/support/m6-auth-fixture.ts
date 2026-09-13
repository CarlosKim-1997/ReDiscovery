import type { TrustedAuthPort, TrustedIdentity } from "@/ports/trusted-auth";
import type { AccountStorePort } from "@/ports/account-store";
import { sessionClaimDecision, type Account, type SessionClaimResult } from "@/domain/identity/account";
import { createPlaySession, type PlaySession } from "@/domain/play/session";
import type { AuthenticationDependencies } from "@/application/identity/authentication";

export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const AUTH_FIXTURE_DEVICE = fixtureId(1);
export const AUTH_FIXTURE_SESSION = fixtureId(2);
export const AUTH_FIXTURE_SUBJECT = `supabase:${fixtureId(3)}`;
export const AUTH_FIXTURE_TIME = new Date("2026-09-13T00:00:00Z");

// Test-owned only; never selectable through a production environment/client input.
export class FakeTrustedAuth implements TrustedAuthPort {
  identity: TrustedIdentity | undefined;
  readonly callbacks: string[] = [];
  exchanges = 0; logouts = 0;
  async getIdentity() { return this.identity; }
  async startGoogleLogin(callback: string) { this.callbacks.push(callback); return "https://project.supabase.co/auth/v1/authorize?provider=google"; }
  async exchangeCode(code: string) {
    this.exchanges++;
    if (code !== "valid" || this.identity) throw new Error("AUTH_EXCHANGE_FAILED");
    this.identity = { externalSubject: AUTH_FIXTURE_SUBJECT };
  }
  async logout() { this.identity = undefined; this.logouts++; }
}

export function authFixture() {
  const auth = new FakeTrustedAuth();
  const accounts = new Map<string, Account>();
  const sessions = new Map<string, PlaySession>();
  for (const id of [AUTH_FIXTURE_SESSION, fixtureId(4), fixtureId(5)]) sessions.set(id, {
    ...createPlaySession({ id, dailyId: `daily-${id}`, contentVersionId: "content", anonymousDeviceId: AUTH_FIXTURE_DEVICE, nodeIds: [] }), status: "REVEALED", revealCompleted: true,
  });
  const claims: string[] = [];
  const store: AuthenticationDependencies["store"] & AccountStorePort = {
    async getOwnedSession(id, deviceId) { const s = sessions.get(id); return s?.anonymousDeviceId === deviceId ? s : undefined; },
    async findAccountByExternalSubject(subject) { return accounts.get(subject); },
    async resolveAccount(subject, at) {
      const existing = accounts.get(subject); if (existing) return existing;
      const account = { id: fixtureId(100 + accounts.size), externalSubject: subject, createdAt: at, updatedAt: at };
      accounts.set(subject, account); return account;
    },
    async claimOfficialSession(input): Promise<SessionClaimResult> {
      claims.push(input.sessionId);
      if (![...accounts.values()].some(a => a.id === input.accountId)) return { kind: "ACCOUNT_NOT_FOUND" };
      const s = sessions.get(input.sessionId);
      const ownership = s ? { sessionId: s.id, anonymousDeviceId: s.anonymousDeviceId, attemptType: s.attemptType, ...(s.accountId ? { accountId: s.accountId, accountClaimedAt: s.accountClaimedAt! } : {}) } : undefined;
      const kind = sessionClaimDecision(ownership, input.accountId, input.deviceId);
      if (kind === "ALREADY_CLAIMED_BY_ACCOUNT") return { kind, ownership: ownership! };
      if (kind !== "CLAIMED") return { kind };
      const claimed = { ...ownership!, accountId: input.accountId, accountClaimedAt: input.claimedAt };
      sessions.set(input.sessionId, { ...s!, accountId: input.accountId, accountClaimedAt: input.claimedAt });
      return { kind, ownership: claimed };
    },
  };
  return { auth, accounts, sessions, claims, deps: { auth, store, clock: { now: () => AUTH_FIXTURE_TIME } } };
}
