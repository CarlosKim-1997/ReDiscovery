import "server-only";
import { SystemClock } from "@/adapters/system-clock/system-clock";
import { serverConfig } from "@/config/server";
import type { ClockPort } from "@/ports/clock";
import type { JudgePort } from "@/ports/judge";
import type { PrimaryStorePort } from "@/ports/primary-store";
import { FakeJudgeAdapter } from "@/adapters/fake-judge/fake-judge";
import { InMemoryPrimaryStore } from "@/adapters/in-memory-primary-store/in-memory-primary-store";

/** The composition root is the only place that chooses concrete adapters. */
const demoStore = new InMemoryPrimaryStore();

export const services: Readonly<{ clock: ClockPort; judge: JudgePort; store: PrimaryStorePort }> = Object.freeze({
  clock: new SystemClock(),
  judge: new FakeJudgeAdapter(),
  store: demoStore,
});

export const config = serverConfig;
