import "server-only";
import { serverConfig } from "@/config/server";
import type { ClockPort } from "@/ports/clock";
import type { JudgePort } from "@/ports/judge";
import type { PrimaryStorePort } from "@/ports/primary-store";
import { FakeJudgeAdapter } from "@/adapters/fake-judge/fake-judge";
import { PostgresPrimaryStore } from "@/adapters/postgres-primary-store/postgres-primary-store";
import { NodeIdentityAdapter } from "@/adapters/node-identity/node-identity";
import type { IdentityPort } from "@/ports/identity";
import { OpenAIJudgeAdapter, OpenAIResponsesJudgeTransport } from "@/adapters/openai-judge/openai-judge";
import { makeClock } from "@/server/clock";

function makeJudge():JudgePort {
  if(serverConfig.JUDGE_ADAPTER==="fake")return new FakeJudgeAdapter();
  return new OpenAIJudgeAdapter(new OpenAIResponsesJudgeTransport(serverConfig.OPENAI_API_KEY!),serverConfig.PRIMARY_JUDGE_MODEL!);
}

/** The composition root is the only place that chooses concrete adapters. */
export const services: Readonly<{ clock: ClockPort; identity:IdentityPort; judge: JudgePort; store: PrimaryStorePort }> = Object.freeze({
  clock: makeClock(serverConfig),
  identity: new NodeIdentityAdapter(),
  judge: makeJudge(),
  store: new PostgresPrimaryStore(serverConfig.DATABASE_URL),
});

export const config = serverConfig;
