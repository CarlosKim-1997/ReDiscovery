import "server-only";
import { SystemClock } from "@/adapters/system-clock/system-clock";
import { serverConfig } from "@/config/server";
import type { ClockPort } from "@/ports/clock";

/** The composition root is the only place that chooses concrete adapters. */
export const services: Readonly<{ clock: ClockPort }> = Object.freeze({
  clock: new SystemClock(),
});

export const config = serverConfig;
