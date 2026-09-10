# 0010 — M3 Final Synthesis Runtime Core

**Status:** Provider-free persistence/domain/application implementation; API/UI and provider candidate not implemented.

## Lifecycle and compatibility

Final-Synthesis-enabled content is detected generically by the presence of
`SERVER_POLICY.final_synthesis`. Its persistent lifecycle is:

```text
THINKING → SYNTHESIZING → LOCKED | REVEAL_READY → future REVEALED
```

Only `SYNTHESIZING` and `REVEAL_READY` are added to persistent `PlayStatus`.
The attempt row owns `EVALUATING`, `VERIFIED`, `INSUFFICIENT`, and
`ERROR_RECOVERABLE`; there is no synthesis evaluation status on the session.
Historical content retains `THINKING → LOCKABLE → LOCKED → REVEALED`, and its
`LOCKABLE` meaning is not reinterpreted.

Both bounded exhaustion paths enter synthesis: the ordinary max-turn `RESCUE`
inside `applyJudgeVerdict`, and the special corrective Rescue transition. They
record `RESCUE_EXHAUSTED`. Existing full semantic eligibility records
`DISCOVERY_READY`. Judge semantics and `node_discoveries` are unchanged.

## Persistence and evidence authority

One append-only migration creates `final_synthesis_attempts`, expands the two
session statuses, prepares `ai_runs` purpose `FINAL_SYNTHESIS_VERIFY`, and adds
`play_sessions.verified_synthesis_attempt_id`. Synthesis is never stored as a
normal `user_answers` turn. The raw synthesis follows the existing anonymous
30-day raw-text policy: purge nulls `text` and sets `purged_at`, while the row,
hashes, counts, redacted result, and verified evidence reference survive.

The two Lock evidence sources are mutually exclusive:

- `lock_answer_id` is historical verified evidence;
- `verified_synthesis_attempt_id` is Final Synthesis verified evidence;
- neither means an unverified Reveal path.

No duplicate completion-outcome column is persisted. `locked_at` is evidence
time, not a synonym for `REVEALED`; it is present exactly when one verified Lock
evidence source exists. Therefore `SYNTHESIZING → REVEAL_READY → REVEALED`
keeps `locked_at` null.

Final Synthesis character limits use a database `utf16_code_unit_length(text)`
function matching JavaScript `text.length`. Historical `user_answers.char_count`
continues to use PostgreSQL character counting unchanged.

## Submission, retry, and recovery

A new attempt row consumes one of exactly two user submissions. A provider's
bounded internal retries remain in the same `evaluation_generation`. An exhausted
operational failure moves the same attempt to `ERROR_RECOVERABLE`; user retry
increments only `evaluation_generation`, not `attempt_number`.

Reservation, provider execution, and completion are separate phases. No database
transaction remains open across verifier execution. Session `state_version`, an
attempt generation fence, a lease, hashed idempotency key, and an independent
synthesis-text hash provide fail-closed recovery. A late completion from an old
generation cannot overwrite the current generation. Exactly-once provider calls
are not claimed; user-budget consumption and semantic completion are fenced.

`ai_runs` stores only redacted operational metadata and explicit attempt/generation
provenance. It contains no synthesis, prompt, provider response, or literal proof.

## Runtime boundary

The dedicated application module orchestrates the provider-neutral
`FinalSynthesisVerifierPort`, validates `final-synthesis-proof-v1`, derives node
support deterministically, and commits only redacted results. The port now returns
an operational execution envelope, but its semantic input authority and proof
contract are unchanged.

The existing legacy Lock policy rejects Final-Synthesis-enabled content with
`FINAL_SYNTHESIS_REQUIRED`, preventing the current `/lock` route from bypassing
the future gate. No Final Synthesis HTTP endpoint, client DTO, route, UI, OpenAI
adapter, prompt, dataset, model, scheduled v5 Daily, or new E2E path exists yet.
M3 remains OPEN and the Final Holdout remains UNCREATED / UNCONSUMED.
