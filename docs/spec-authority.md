# Specification authority

The user's **G1 Master Codex Handoff Packet v1**, sections 0–80, is the canonical
implementation specification. This file is an implementation index, **not a full
copy or a replacement**. When any summary, repository decision, old conversation,
or earlier design conflicts with that packet, the packet prevails.

## M0 acceptance (packet §71, §76, §80)

Repository; strict TypeScript; Next.js App Router; Tailwind; pnpm; Zod configuration
validation; ports/adapters boundary; ClockPort; CI; smoke test. Zero OpenAI calls.
`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`
must pass. Report changed files, architecture, environment, verification, and
remaining issues before proceeding to M1. No future milestone code in M0.

## Non-negotiable references for subsequent work

- §2, §5–7: deterministic server authority, no chatbot UI, human approval of content,
  vendor isolation, **PUBLIC_PLAY / JUDGE_RUBRIC / SERVER_POLICY / REVEAL_CONTENT**.
- §10–11, §52–53: raw thought only in `user_answers.text`; evidence/quotes use
  answer IDs and spans; no raw prompts/responses or thought in analytics; anonymous
  completed user-derived text purged after default 30 days. Long-term anonymous
  de-identification policy remains deferred.
- §12–23: server-clock Asia/Seoul Daily, first official attempt uniqueness,
  completion at Reveal unlock separately from official status; immutable start/
  completion identity; post-Reveal current-session-only attach; no historical
  anonymous merge or mid-game attach; DB state version remains mandatory.
- §24–43: stateless semantic classifier, literal current-answer evidence,
  deterministic guidance and Lock, no failure state, representative quote refs,
  AI-independent Reveal, personalized deterministic comparison fallback,
  no post-render text swap, Gold Eval gate, bounded adjudication.
- §44–50: ordered abuse checks, 2,000-character hard input limit, nonce,
  idempotency, mutex, state version, cost reservations and circuit breaker.
- §58–59, §69–78: no full experimentation engine or runtime Shadow Judge;
  content approval remains human; implementation follows milestone order;
  final branding, model choice, Reveal timing, scoring and other listed decisions
  remain deferred.

All other requirements and exact contracts remain governed by the original packet.

## M1 implementation scope

M1 implements only the deterministic Conway walking skeleton authorized after M0:
minimal PlaySession/policy, JudgePort with FakeJudgeAdapter, PrimaryStorePort with
InMemoryPrimaryStore, M1-only local snapshot replay, browser routes, Lock/Reveal,
and Result. It does not weaken or replace any Master Packet rule. Production Daily,
content persistence, identity, external AI, abuse/cost, and analytics remain later
milestones.

## Current milestone scope

M0–M2 are accepted and closed. M3 is closed under the Runtime v1 product-fit
semantic-sensor definition established by
[ADR 0017](decisions/0017-product-runtime-v1-adaptive-guidance.md). That decision
supersedes the earlier Final Holdout closure requirement only for the current
Runtime v1 product milestone; it does not rewrite or pass any historical verifier
experiment. Final Synthesis remains a preserved research asset and replacement
seam. M4 is closed: M4-A/B/C supply learner state, approved guidance, two-turn
gameplay, provider readiness and same-answer pause/resume. M4-D verified the real
`judge-v3` Luna runtime internal-only with exactly three OpenAI requests and no
retries. Conway v6 remains UNSCHEDULED; Daily publication/alpha activation is
deferred. Local DB migration/persistence verification remains mandatory before M9.
Semantic AI is essential; no AI-free degraded mode is permitted.
M5 Reveal / Personalization is CLOSED; M5-A deterministic outcome, M5-B
evidence-grounded personalized connection and M5-C default 3000 ms Reveal
choreography are complete. Skip and reduced-motion bypass are supported.
M6 Identity is CLOSED; final independent closure review PASSED per the product
owner's canonical handoff. M6-A provider-neutral Account and explicit single official
session claim foundation is complete. Only the explicitly current device-owned
official session may be claimed; historical anonymous auto-merge is forbidden.
M6-B Supabase Auth / Google-only SSR trusted claims integration is complete;
M6-C live OAuth/claim smoke PASSED, M6-D identity hardening and M6-E data access
boundary hardening are complete, and the M6-E live security gate PASSED.
M7 Abuse / Cost is OPEN; M7-A implements the product owner's approved paid Judge
operation admission/replay contract. Strict turn/submission identity, durable
per-attempt admissions, one explicit recovery round and atomic semantic settlement
are canonical. Legacy failures preserve accepted answers rather than deleting them.
Operation provenance blocks implicit cascade deletion while raw text remains
purgeable. M7-B global budget/Gmail work and M8–M10 remain NOT STARTED.
v6 remains unscheduled. M5-A adds no score, animation,
provider call or persistence schema. M5-B adds approved Reveal-only v7 mapping and
minimal reflective comparison rendering without generated prose;
v7 also remains unscheduled.
