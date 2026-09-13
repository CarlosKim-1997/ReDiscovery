import { describe, expect, it, vi } from "vitest";
import { claimCurrentOfficialSession, resolveAuthenticatedAccount } from "@/application/identity/session-claim";
import { externalSubjectSchema, sessionClaimDecision, type Account, type SessionAccountOwnership, type SessionClaimResult } from "@/domain/identity/account";
import { createPlaySession } from "@/domain/play/session";
import type { AccountStorePort } from "@/ports/account-store";

const accountId = "00000000-0000-4000-8000-000000000001";
const otherAccountId = "00000000-0000-4000-8000-000000000002";
const deviceId = "00000000-0000-4000-8000-000000000003";
const sessionId = "00000000-0000-4000-8000-000000000004";
const at = new Date("2026-09-13T00:00:00Z");
const existing: Account = { id: accountId, externalSubject: "synthetic:player", createdAt: at, updatedAt: at };
const current: SessionAccountOwnership = { sessionId, anonymousDeviceId: deviceId, attemptType: "OFFICIAL" };

function fixture() {
  const accounts = new Map<string, Account>();
  const sessions = new Map<string, SessionAccountOwnership>([[sessionId, current], ["older", { ...current, sessionId: "older" }], ["newer", { ...current, sessionId: "newer" }]]);
  const writes = vi.fn();
  const store: AccountStorePort = {
    async findAccountByExternalSubject(subject) { return accounts.get(subject); },
    async resolveAccount(subject, instant) {
      const found = accounts.get(subject); if (found) return found;
      const made = { ...existing, id: accounts.size ? otherAccountId : accountId, externalSubject: subject, createdAt: instant, updatedAt: instant };
      accounts.set(subject, made); return made;
    },
    async claimOfficialSession(input): Promise<SessionClaimResult> {
      if (![...accounts.values()].some(a => a.id === input.accountId)) return { kind: "ACCOUNT_NOT_FOUND" };
      const state = sessions.get(input.sessionId);
      const kind = sessionClaimDecision(state, input.accountId, input.deviceId);
      if (kind === "ALREADY_CLAIMED_BY_ACCOUNT") return { kind, ownership: state! };
      if (kind !== "CLAIMED") return { kind };
      const claimed = { ...state!, accountId: input.accountId, accountClaimedAt: input.claimedAt };
      writes(input.sessionId); sessions.set(input.sessionId, claimed);
      return { kind, ownership: claimed };
    },
  };
  return { store, sessions, accounts, writes, clock: { now: () => at } };
}

describe("M6 provider-neutral explicit session claim", () => {
  it("resolves and creates exactly one account per subject", async () => {
    const f = fixture(); const first = await resolveAuthenticatedAccount(f, existing.externalSubject);
    expect(await resolveAuthenticatedAccount(f, existing.externalSubject)).toBe(first);
    expect(await f.store.findAccountByExternalSubject(existing.externalSubject)).toBe(first);
    expect(f.accounts.size).toBe(1);
  });
  it.each(["", "   ", "x".repeat(256), "invalid\u0000subject"])("rejects invalid bounded subject %j", value => {
    expect(externalSubjectSchema.safeParse(value).success).toBe(false);
  });
  it("claims only the explicit current session, not older or newer device history", async () => {
    const f = fixture(); const account = await resolveAuthenticatedAccount(f, existing.externalSubject);
    expect((await claimCurrentOfficialSession(f, account, sessionId, deviceId)).kind).toBe("CLAIMED");
    expect(f.writes.mock.calls).toEqual([[sessionId]]);
    expect(f.sessions.get("older")?.accountId).toBeUndefined();
    expect(f.sessions.get("newer")?.accountId).toBeUndefined();
    expect(f.sessions.get(sessionId)?.anonymousDeviceId).toBe(deviceId);
  });
  it("same-account replay has no mutation and preserves the original timestamp", async () => {
    const f = fixture(); const account = await resolveAuthenticatedAccount(f, existing.externalSubject);
    await claimCurrentOfficialSession(f, account, sessionId, deviceId);
    const later = { ...f, clock: { now: () => new Date("2026-09-14T00:00:00Z") } };
    const result = await claimCurrentOfficialSession(later, account, sessionId, deviceId);
    expect(result.kind).toBe("ALREADY_CLAIMED_BY_ACCOUNT");
    if ("ownership" in result) expect(result.ownership.accountClaimedAt).toBe(at);
    expect(f.writes).toHaveBeenCalledTimes(1);
  });
  it("another persisted account cannot steal the claimed session", async () => {
    const f = fixture(); const a = await resolveAuthenticatedAccount(f, existing.externalSubject);
    const b = await resolveAuthenticatedAccount(f, "synthetic:other-player");
    await claimCurrentOfficialSession(f, a, sessionId, deviceId);
    expect(await claimCurrentOfficialSession(f, b, sessionId, deviceId)).toEqual({ kind: "OWNED_BY_ANOTHER_ACCOUNT" });
    expect(f.sessions.get(sessionId)?.accountId).toBe(a.id); expect(f.writes).toHaveBeenCalledTimes(1);
  });
  it.each([
    [undefined, "SESSION_NOT_FOUND"],
    [{ ...current, anonymousDeviceId: otherAccountId }, "NOT_CURRENT_DEVICE_SESSION"],
    [{ ...current, attemptType: "PRACTICE" }, "NOT_OFFICIAL"],
    [{ ...current, accountId: otherAccountId }, "OWNED_BY_ANOTHER_ACCOUNT"],
  ] as const)("rejects ineligible ownership with a typed reason", (state, reason) => {
    expect(sessionClaimDecision(state, accountId, deviceId)).toBe(reason);
  });
  it("requires persisted account existence and an explicit UUID session ID", async () => {
    const f = fixture(); expect(await claimCurrentOfficialSession(f, existing, sessionId, deviceId)).toEqual({ kind: "ACCOUNT_NOT_FOUND" });
    expect(() => claimCurrentOfficialSession(f, existing, "", deviceId)).toThrow();
  });
  it.each(["THINKING", "EVALUATING", "REVEALED", "ERROR_RECOVERABLE", "REVEAL_READY"] as const)("does not impose a completion requirement on %s", status => {
    const session = { ...createPlaySession({ id: sessionId, dailyId: "daily", contentVersionId: "content", anonymousDeviceId: deviceId, nodeIds: [] }), status };
    expect(sessionClaimDecision({ ...current, anonymousDeviceId: session.anonymousDeviceId, attemptType: session.attemptType }, accountId, deviceId)).toBe("CLAIMED");
    expect(session.accountId).toBeUndefined();
  });
});
