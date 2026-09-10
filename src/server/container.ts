import "server-only";
import { serverConfig } from "@/config/server";
import type { ClockPort } from "@/ports/clock";
import type { JudgePort } from "@/ports/judge";
import type { PrimaryStorePort } from "@/ports/primary-store";
import { FakeJudgeAdapter } from "@/adapters/fake-judge/fake-judge";
import { FinalSynthesisEntryFakeJudgeAdapter } from "@/adapters/fake-judge/final-synthesis-entry-fake-judge";
import { PostgresPrimaryStore } from "@/adapters/postgres-primary-store/postgres-primary-store";
import { NodeIdentityAdapter } from "@/adapters/node-identity/node-identity";
import type { IdentityPort } from "@/ports/identity";
import { OpenAIJudgeAdapter, OpenAIResponsesJudgeTransport } from "@/adapters/openai-judge/openai-judge";
import { makeClock } from "@/server/clock";
import type { FinalSynthesisVerifierPort } from "@/ports/final-synthesis-verifier";
import { makeFinalSynthesisVerifier } from "@/server/final-synthesis-verifier";

function makeJudge():JudgePort {
  if(serverConfig.JUDGE_ADAPTER==="fake"){
    const fake=new FakeJudgeAdapter();
    return serverConfig.APP_ENV==="test"?new FinalSynthesisEntryFakeJudgeAdapter(fake):fake;
  }
  return new OpenAIJudgeAdapter(new OpenAIResponsesJudgeTransport(serverConfig.OPENAI_API_KEY!),serverConfig.PRIMARY_JUDGE_MODEL!);
}

/** The composition root is the only place that chooses concrete adapters. */
export const services: Readonly<{ clock: ClockPort; identity:IdentityPort; judge: JudgePort; finalSynthesisVerifier:FinalSynthesisVerifierPort; store: PrimaryStorePort }> = Object.freeze({
  clock: makeClock(serverConfig),
  identity: new NodeIdentityAdapter(),
  judge: makeJudge(),
  finalSynthesisVerifier: makeFinalSynthesisVerifier(serverConfig),
  store: new PostgresPrimaryStore(serverConfig.DATABASE_URL),
});

export const config = serverConfig;
