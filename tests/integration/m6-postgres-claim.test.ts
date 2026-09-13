import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createHash, randomUUID } from "node:crypto";
import { PostgresPrimaryStore } from "@/adapters/postgres-primary-store/postgres-primary-store";
import { assertE2eFixtureSafety } from "../support/e2e-fixture-safety";

const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;
const at = new Date("2026-09-13T00:00:00Z");

suite("M6 dedicated PostgreSQL claim persistence", () => {
  let store: PostgresPrimaryStore;
  let sql: ReturnType<typeof postgres>;
  const deviceIds: string[] = [];
  const accountIds: string[] = [];
  beforeAll(() => {
    // Only the repository's dedicated loopback test DB is eligible. Never use
    // a default/shared/production URL just because DATABASE_URL is present.
    assertE2eFixtureSafety({ APP_ENV: process.env.APP_ENV, E2E_ALLOW_DB_FIXTURES: "1", DATABASE_URL: url });
    store = new PostgresPrimaryStore(url!); sql = postgres(url!);
  });
  afterAll(async () => {
    if (!sql) return;
    // Cleanup only UUIDs created by this suite, never a history-wide truncate.
    for (const id of deviceIds) {
      await sql`DELETE FROM play_sessions WHERE anonymous_device_id=${id}`;
      await sql`DELETE FROM anonymous_devices WHERE id=${id}`;
    }
    for (const id of accountIds) await sql`DELETE FROM accounts WHERE id=${id}`;
    await store.close(); await sql.end();
  });
  async function device() { const d = await store.createDevice(createHash("sha256").update(randomUUID()).digest("hex")); deviceIds.push(d.id); return d.id; }
  async function account() { const a = await store.resolveAccount(`synthetic:${randomUUID()}`, at); accountIds.push(a.id); return a; }
  async function official(deviceId: string, instant = "2026-09-08T03:00:00Z") {
    const daily = await store.resolveDaily(new Date(instant)); expect(daily).toBeDefined();
    return store.startOfficialSession(deviceId, daily!, []);
  }
  const claim = (accountId: string, sessionId: string, deviceId: string, claimedAt = at) => store.claimOfficialSession({ accountId, sessionId, deviceId, claimedAt });

  it("concurrently resolves one account per exact external subject without timestamp mutation", async () => {
    const subject = `synthetic:${randomUUID()}`;
    const [a, b] = await Promise.all([store.resolveAccount(subject, at), store.resolveAccount(subject, at)]);
    accountIds.push(a.id); expect(a.id).toBe(b.id);
    expect(await store.findAccountByExternalSubject(subject)).toEqual(a);
    expect(await store.resolveAccount(subject, new Date("2026-09-14T00:00:00Z"))).toEqual(a);
    await expect(sql`INSERT INTO accounts(external_subject,created_at,updated_at) VALUES(${subject},${at},${at})`).rejects.toThrow(/unique/i);
  });
  it("claims only the supplied official session; old/new same-device sessions remain NULL", async () => {
    const d = await device(); const a = await account();
    const older = await official(d); const current = await official(d, "2026-09-09T03:00:00Z");
    const [newer] = await sql<{ id: string }[]>`INSERT INTO play_sessions(daily_id,content_version_id,anonymous_device_id,attempt_type,status,stage) VALUES(${current.dailyId},${current.contentVersionId},${d},'PRACTICE','THINKING','BLIND') RETURNING id`;
    expect((await claim(a.id, current.id, d)).kind).toBe("CLAIMED");
    const untouched = await sql<{ account_id: string | null }[]>`SELECT account_id FROM play_sessions WHERE id IN (${older.id},${newer!.id})`;
    expect(untouched.map(s => s.account_id)).toEqual([null, null]);
    const loaded = await store.getOwnedSession(current.id, d);
    expect(loaded?.accountId).toBe(a.id); expect(loaded?.accountClaimedAt).toEqual(at); expect(loaded?.anonymousDeviceId).toBe(d);
    expect(loaded?.stateVersion).toBe(current.stateVersion);
    const version = loaded!.stateVersion;
    expect((await claim(a.id, current.id, d, new Date("2026-09-14T00:00:00Z"))).kind).toBe("ALREADY_CLAIMED_BY_ACCOUNT");
    expect((await store.getOwnedSession(current.id, d))?.accountClaimedAt).toEqual(at);
    expect((await store.getOwnedSession(current.id, d))?.stateVersion).toBe(version);
    expect((await claim(a.id, newer!.id, d)).kind).toBe("NOT_OFFICIAL");
  });
  it("rejects missing account/session, foreign device and concurrent account theft", async () => {
    const d = await device(); const s = await official(d); const a = await account(); const b = await account();
    expect((await claim(randomUUID(), s.id, d)).kind).toBe("ACCOUNT_NOT_FOUND");
    expect((await claim(a.id, randomUUID(), d)).kind).toBe("SESSION_NOT_FOUND");
    expect((await claim(a.id, s.id, randomUUID())).kind).toBe("NOT_CURRENT_DEVICE_SESSION");
    const results = await Promise.all([claim(a.id, s.id, d), claim(b.id, s.id, d)]);
    expect(results.map(r => r.kind).sort()).toEqual(["CLAIMED", "OWNED_BY_ANOTHER_ACCOUNT"]);
  });
  it.each(["THINKING", "EVALUATING", "REVEALED", "ERROR_RECOVERABLE", "REVEAL_READY"])("persists and reloads claim for %s without changing status", async status => {
    const d = await device(); const s = await official(d); const a = await account();
    await sql`UPDATE play_sessions SET status=${status} WHERE id=${s.id}`;
    expect((await claim(a.id, s.id, d)).kind).toBe("CLAIMED");
    const loaded = await store.getOwnedSession(s.id, d);
    expect(loaded?.status).toBe(status); expect(loaded?.accountId).toBe(a.id); expect(loaded?.accountClaimedAt).toEqual(at);
    expect(loaded?.stateVersion).toBe(s.stateVersion);
  });
});
