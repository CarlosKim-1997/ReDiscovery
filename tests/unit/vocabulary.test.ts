import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AMBIGUITIES,
  ANSWER_TYPES,
  ATTEMPT_TYPES,
  NODE_STATUSES,
  PLAY_STAGES,
  PLAY_STATUSES,
  type Ambiguity,
  type AnswerType,
  type AttemptType,
  type NodeStatus,
  type PlayStage,
  type PlayStatus,
} from "@/domain/play/vocabulary";
import { COMPARISON_STATUSES, type ComparisonStatus } from "@/domain/reveal/vocabulary";

// Independent contract fixture: do not derive expected strings from production code.
const canonical = {
  AttemptType: ["OFFICIAL", "REPLAY", "PRACTICE"],
  PlayStatus: ["CREATED", "THINKING", "EVALUATING", "LOCKABLE", "LOCKED", "REVEALED", "ERROR_RECOVERABLE", "ABUSE_BLOCKED"],
  PlayStage: ["BLIND", "REFLECT", "NUDGE", "CORRECTION", "RESCUE"],
  NodeStatus: ["DISCOVERED", "PARTIAL", "ABSENT", "CONTRADICTED"],
  AnswerType: ["REASONING", "OFF_TOPIC", "ASKING_FOR_ANSWER", "META", "EMPTY"],
  Ambiguity: ["NONE", "TOO_SHORT", "UNCLEAR_REFERENCE", "CONFLICTING_CLAIMS", "SEMANTIC_BOUNDARY"],
  ComparisonStatus: ["NOT_REQUESTED", "PENDING", "READY", "FALLBACK_USED", "FAILED"],
} as const;

const actual = {
  AttemptType: ATTEMPT_TYPES,
  PlayStatus: PLAY_STATUSES,
  PlayStage: PLAY_STAGES,
  NodeStatus: NODE_STATUSES,
  AnswerType: ANSWER_TYPES,
  Ambiguity: AMBIGUITIES,
  ComparisonStatus: COMPARISON_STATUSES,
};

describe("canonical domain vocabulary", () => {
  it.each(Object.keys(canonical) as Array<keyof typeof canonical>)(
    "%s serializes to exactly the canonical strings",
    (name) => {
      expect(JSON.stringify(actual[name])).toBe(JSON.stringify(canonical[name]));
    },
  );

  it("exports exact literal unions without widening or adding values", () => {
    // These assertions are enforced by pnpm typecheck/build, not just Vitest.
    expectTypeOf<AttemptType>().toEqualTypeOf<(typeof canonical.AttemptType)[number]>();
    expectTypeOf<PlayStatus>().toEqualTypeOf<(typeof canonical.PlayStatus)[number]>();
    expectTypeOf<PlayStage>().toEqualTypeOf<(typeof canonical.PlayStage)[number]>();
    expectTypeOf<NodeStatus>().toEqualTypeOf<(typeof canonical.NodeStatus)[number]>();
    expectTypeOf<AnswerType>().toEqualTypeOf<(typeof canonical.AnswerType)[number]>();
    expectTypeOf<Ambiguity>().toEqualTypeOf<(typeof canonical.Ambiguity)[number]>();
    expectTypeOf<ComparisonStatus>().toEqualTypeOf<(typeof canonical.ComparisonStatus)[number]>();
  });
});
