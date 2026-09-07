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
