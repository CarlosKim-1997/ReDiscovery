import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ token: undefined as string | undefined, active: false, lookupFails: false,
  set: vi.fn(), create: vi.fn(async () => ({ id: "fresh-device" })), touch: vi.fn(async () => {}),
  lookup: vi.fn(async (_hash: string): Promise<{id: string} | undefined> => {
    void _hash;
    if (state.lookupFails) throw new Error("DATABASE_UNAVAILABLE");
    return state.active ? { id: "existing-device" } : undefined;
  }),
  start: vi.fn(async (_deps: unknown, _device: string) => { void _deps; void _device; return { session: { id: "test-only-new-session" } }; }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.token === undefined ? undefined : { value: state.token }, set: state.set }) }));
vi.mock("@/server/container", () => ({ config: { APP_ENV: "local" }, services: {
  identity: { hashToken: (_token: string) => { void _token; return "test-only-hash"; }, randomToken: () => "test-only-fresh-token" },
  store: { findActiveDevice: state.lookup, createDevice: state.create, touchDevice: state.touch, startOfficialSession: state.start },
} }));
vi.mock("@/application/play/daily-game", async importOriginal => ({
  ...await importOriginal<typeof import("@/application/play/daily-game")>(),
  startOfficial: state.start,
}));
import { resolveCurrentDevice, currentDevice, ensureCurrentDevice } from "@/app/api/_device";
import { GET as readSession } from "@/app/api/play-sessions/[session]/route";
import { GET as readReveal } from "@/app/api/play-sessions/[session]/reveal/route";
import { POST as createSession } from "@/app/api/play-sessions/route";

describe("M6-D non-destructive anonymous principal resolution", () => {
  beforeEach(() => { vi.clearAllMocks(); state.token = undefined; state.active = false; state.lookupFails = false; });
  const noMutation = () => { expect(state.create).not.toHaveBeenCalled(); expect(state.touch).not.toHaveBeenCalled(); expect(state.set).not.toHaveBeenCalled(); expect(state.start).not.toHaveBeenCalled(); };
  it.each(["MISSING", "STALE"])("returns %s without mutations", async kind => {
    if (kind === "STALE") state.token = "test-only-stale-token";
    expect(await resolveCurrentDevice()).toEqual({ kind }); expect(await currentDevice()).toBeUndefined(); noMutation();
  });
  it("ACTIVE resolves existing principal without touch/create/cookie issuance", async () => {
    state.token = "test-only-active-token"; state.active = true;
    expect(await resolveCurrentDevice()).toEqual({ kind: "ACTIVE", device: { id: "existing-device" } }); noMutation();
  });
  it("lookup errors remain errors and never create replacements", async () => {
    state.token = "test-only-token"; state.lookupFails = true;
    await expect(resolveCurrentDevice()).rejects.toThrow("DATABASE_UNAVAILABLE");
    await expect(ensureCurrentDevice()).rejects.toThrow("DATABASE_UNAVAILABLE"); noMutation();
  });
  it.each(["missing", "stale"])("existing-session reads with %s proof fail safely before ownership access", async kind => {
    if (kind === "stale") state.token = "test-only-stale-token";
    const context = { params: Promise.resolve({ session: "test-only-session" }) };
    const request = new Request("http://localhost:3000");
    for (const read of [readSession, readReveal]) {
      const response = await read(request, context);
      expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "SESSION_NOT_FOUND" });
    }
    noMutation();
  });
  it.each(["missing", "stale"])("explicit creation boundary can ensure fresh principal for %s proof", async kind => {
    if (kind === "stale") state.token = "test-only-stale-token";
    expect((await createSession()).status).toBe(200); expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.set).toHaveBeenCalledTimes(1); expect(state.start).toHaveBeenCalledTimes(1);
    expect(state.start.mock.calls[0]?.[1]).toBe("fresh-device");
    expect(state.touch).not.toHaveBeenCalled();
  });
  it("ensure reuses ACTIVE principal without issuing cookie", async () => {
    state.token = "test-only-active-token"; state.active = true;
    expect(await ensureCurrentDevice()).toEqual({ id: "existing-device" }); expect(state.touch).toHaveBeenCalledOnce();
    expect(state.create).not.toHaveBeenCalled(); expect(state.set).not.toHaveBeenCalled();
  });
});
