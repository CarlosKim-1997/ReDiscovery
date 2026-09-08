import "server-only";
import { SystemClock } from "@/adapters/system-clock/system-clock";
import { serverConfig } from "@/config/server";
import type { ClockPort } from "@/ports/clock";
import type { JudgePort } from "@/ports/judge";
import type { PrimaryStorePort } from "@/ports/primary-store";
import { FakeJudgeAdapter } from "@/adapters/fake-judge/fake-judge";
import { PostgresPrimaryStore } from "@/adapters/postgres-primary-store/postgres-primary-store";
import { NodeIdentityAdapter } from "@/adapters/node-identity/node-identity";
import type { IdentityPort } from "@/ports/identity";

/** The composition root is the only place that chooses concrete adapters. */
export const services: Readonly<{ clock: ClockPort; identity:IdentityPort; judge: JudgePort; store: PrimaryStorePort }> = Object.freeze({
  clock: new SystemClock(),
  identity: new NodeIdentityAdapter(),
  judge: new FakeJudgeAdapter(),
  store: new PostgresPrimaryStore(serverConfig.DATABASE_URL),
});

export const config = serverConfig;
