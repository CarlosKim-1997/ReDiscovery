import raw from "../../content/approved/conway-law.v7.json" with { type: "json" };
import { approvedContentSchema } from "../../src/domain/content/schema";
import { adaptiveRuntimeFixture } from "./adaptive-runtime-fixture";

/** Existing test-owned CAS store; v7 is explicit and never scheduled. */
export function personalizedRevealFixture() {
  const f = adaptiveRuntimeFixture();
  const content = approvedContentSchema.parse(raw);
  const version = { id: "fixture-content", version: content.version, schemaVersion: content.schema_version, contentHash: "fixture-v7", publicPlay: content.PUBLIC_PLAY, judgeRubric: content.JUDGE_RUBRIC, serverPolicy: content.SERVER_POLICY, revealContent: content.REVEAL_CONTENT };
  return { ...f, content, deps: { ...f.deps, store: { ...f.deps.store, getContentVersion: async () => version } } };
}
