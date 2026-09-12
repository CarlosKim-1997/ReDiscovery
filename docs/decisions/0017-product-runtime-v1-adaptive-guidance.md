# ADR 0017 — Product Runtime v1: Adaptive Guidance over Perfect Verification

Status: accepted product direction; M3 closed under the product-fit semantic-sensor criterion

## Context

M3 produced a production-shaped Judge, literal evidence validation, recoverable
provider execution, versioned evaluation corpora, and several increasingly strict
Lock and Final Synthesis verifier experiments. Those experiments are valuable,
but their frozen failures show that making near-infallible final approval the next
release prerequisite would optimize the research verifier rather than the daily
learning experience.

Runtime v1 instead exists to give a player one active intellectual discovery
experience each day. AI reads the current reasoning and supplies the next useful
amount of approved guidance. Occasional semantic classification errors are
acceptable when they neither destroy that experience nor teach false canonical
knowledge. Canonical theory, people, dates, and explanations remain approved
content rather than model-generated truth.

This decision changes the product milestone authority. It supersedes the M3
closure requirements in [ADR 0006](0006-m3-final-holdout-and-closure.md) for
Runtime v1. ADR 0006 and its unconsumed Final Holdout protocol remain preserved
research-era contracts; their conditions were not completed, waived, or reported
as passing.

## Decision

### Fixed two-turn experience

An official daily play has exactly this normal flow:

1. provider readiness gate;
2. today's problem;
3. Turn 1 free reasoning;
4. AI semantic-state analysis;
5. adaptive guidance;
6. Turn 2 reasoning;
7. AI semantic-state analysis;
8. Reveal; and
9. achievement label and personalized comparison.

Runtime v1 has exactly two reasoning turns and no third reasoning turn.

### AI-required play and provider failure

AI semantic feedback is essential, not an optional enhancement. A new official
play must not begin when that feedback cannot reasonably be provided; the game
must not silently degrade into a static quiz. M4 will add a provider-readiness
gate. Readiness should be shared or cached server-side where practical rather than
requiring a dedicated provider request for every player.

If provider capability fails during a session, future M4 behavior must preserve
the session, pause progression, leave the day's play unconsumed and valid, avoid
forcing Reveal without the expected feedback, and resume at the same point when
capability returns.

### Semantic sensor, not truth source or scalar scorer

The AI estimates what the player discovered, what is partial or missing, whether
a known misconception is endorsed, and which literal answer evidence supports
that estimate. It does not produce an arbitrary intellectual score and does not
author canonical historical or theoretical truth.

M4 derives the following product learner states from Judge, node, and misconception
signals where practical; they need not be direct model labels:

- `OFF_TRACK`
- `MISCONCEPTION`
- `ON_TRACK`
- `NEAR_COMPLETE`
- `COMPLETE_LIKELY`

M4 maps those states to deterministic guidance actions:

- `OFF_TRACK` → `REDIRECT`
- `MISCONCEPTION` → `CORRECT`
- `ON_TRACK` → `TARGET`
- `NEAR_COMPLETE` → `BRIDGE`
- `COMPLETE_LIKELY` → `CONSOLIDATE`

The LLM does not freely invent the entire Runtime v1 pedagogical response. Approved
content supplies a Hint Ladder or guidance pool, and runtime chooses the next
appropriate item. Even `COMPLETE_LIKELY` does not announce correctness or reveal
the theory before Reveal; it receives a consolidation prompt for Turn 2.

### Achievement representation

Runtime v1 has no user-facing numerical intellectual score. It uses stage labels:

- `독립 재발견`
- `힌트 후 도달`
- `핵심 일부 포착`
- `Reveal에서 연결`

Persistence should retain structured semantic and progression facts so later
analytics can derive node/component discoveries, missing concepts,
misconceptions, guidance action and target, state transition, and post-guidance
concept appearance without freezing a subjective scalar into raw data. That
analytics system is not part of this decision.

## M3 closure

M3 is closed because it supplies a sufficiently reliable semantic-sensor
foundation for Adaptive Guidance and preserves evidence needed for improvement
during Internal Alpha. Closure does not assert that the research-grade Lock or
Final Synthesis acceptance gates passed. Their original results remain immutable
and accurately reported.

## Preserved Final Synthesis research asset

Final Synthesis is classified as:

**PRESERVED RESEARCH ASSET — NOT A RUNTIME V1 RELEASE BLOCKER**

Its application/runtime code, `FinalSynthesisVerifierPort`, OpenAI adapters, proof
contracts, datasets, evaluators, smoke harness, run-contract infrastructure,
tracked historical artifacts and documentation, failure analyses, and tests stay
intact. They are preserved because:

1. Adaptive Tutor quality may prove insufficient during Internal Alpha.
2. Future scoring, ranking, or certification may raise the cost of semantic errors.
3. Reveal personalization may benefit from deeper semantic verification.
4. Stronger models or different verifier architectures may become economical.

Future runtime may substitute or augment the lightweight semantic sensor with the
preserved Final Synthesis verifier through the existing port/adapter boundary
without redesigning the entire game.

## Boundaries

This decision changes documentation and milestone authority only. It introduces
no M4 runtime code, content schema v6, adaptive guidance schema, analytics,
provider call, new evaluation result, Final Holdout, model promotion, or threshold
change. Conway v5 and its research-era `lock_verifier` and `final_synthesis` fields
remain unchanged. M4 owns the future Hint Ladder content shape.
