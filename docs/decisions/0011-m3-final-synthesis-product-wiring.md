# 0011 — M3 Final Synthesis Product Wiring

**Status:** Accepted; hosted `M3 deterministic checks` passed at
`08fb837fee4f828ec82ed12fb08ee1b03a400a79`.

## Decision

Final-Synthesis-enabled sessions expose three server-authoritative product
operations: submit one new user synthesis, retry the latest recoverable evaluation
without consuming another submission, and skip to `REVEAL_READY`. Each mutation
uses the persisted `state_version`; submission idempotency uses a hashed
`Idempotency-Key`. The browser never supplies an attempt id, generation, adapter,
model, content version, proof component, or semantic expectation.

The public session projection contains only the 500-character and two-submission
limits, submissions used, safe outcome/capability flags, and whether a final
rewrite is available. It does not expose the verifier proof, required nodes or
components, provider metadata, hidden content, or diagnostic failure details.
The synthesis is a separate product phase and never consumes a Thinking turn.

## Reveal semantics

`LOCKED` permits Reveal because verified evidence exists. `REVEAL_READY` permits
Reveal without asserting that self-discovery was verified. A verified Final
Synthesis is the representative thought. An insufficient or skipped path supplies
no representative thought and receives neutral completion copy; failed synthesis
text and server-only component results are not exposed. The canonical outcome is
still derived from the two evidence references, not duplicated in persistence.

## Test-only verifier and v5 activation

No production Final Synthesis provider is selected. `APP_ENV=test` composes a
deterministic verifier whose behavior is controlled by exact fixed fixture texts;
it performs no natural-language keyword inference and no network call. Every
non-test environment receives a fail-closed unavailable adapter until a later
evaluation gate approves a real candidate.

`conway-law` v5 remains unscheduled. E2E creates an isolated PostgreSQL Daily and
owned session pointing to the already-seeded v5 content, then enters that session
directly. The canonical schedule is unchanged, the fixture is unreachable in
production, and no client-controlled content-version selector exists.

## Deferred scope

There is no OpenAI adapter, prompt, model, development dataset, live evaluation,
candidate freeze, production activation, or Final Holdout in this decision. M3
remains OPEN and the Final Holdout remains UNCREATED / UNCONSUMED.
