# 0003 — Untrusted Judge output, literal evidence, and reversible EVALUATING

Status: implemented; real-provider acceptance gate pending

## Decision

Use the OpenAI Responses API with strict Structured Outputs behind `JudgePort`.
The provider returns the canonical answer/ambiguity/status vocabulary plus literal
evidence text. The adapter validates response shape, exact rubric-node membership,
status/evidence consistency, and literal uniqueness. The application validates the
same trust boundary again and converts evidence to UTF-16 span coordinates used by
the existing domain policy and persisted evidence references.

The normal path makes one provider request. The adapter disables SDK retries and
allows exactly one retry for transport, schema, node-set, or literal-evidence
failure. A structurally valid semantic disagreement is returned immediately.

Before external I/O, PostgreSQL atomically inserts the answer and advances the
session to `EVALUATING`. No transaction remains open during the provider call.
Success applies deterministic policy in a second transaction. Failure deletes the
reserved answer and restores the exact prior gameplay state in a short transaction;
`state_version` remains monotonic. This avoids consuming a turn or leaving a
permanent impossible state without introducing M7 mutex, nonce, or idempotency.

## Privacy consequences

`ai_runs` stores provider/model/prompt/content versions, attempt outcome, schema
validity, token counts, latency, optional request ID, and optional cost. It stores no
prompt, response, current answer, or literal evidence. When a failed reservation is
removed, `answer_id` becomes null through `ON DELETE SET NULL`.

## Deferred

Adjudication, dispute/rejudge, outage fallback, budgets, circuit breakers, mutexes,
and Reveal comparison remain later milestones.
