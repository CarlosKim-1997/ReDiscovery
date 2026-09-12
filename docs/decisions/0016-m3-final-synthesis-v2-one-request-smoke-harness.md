# ADR 0016 — Final Synthesis v2.1 audited one-request smoke harness

## Status

Accepted as a provider-free M3 implementation candidate. No provider smoke,
complete development run, Final Holdout work, or runtime activation is authorized
by this decision.

## Context

The first sealed v2 Luna invocation failed during local Structured Outputs schema
construction and produced no semantic evidence. ADR 0015 corrected that boundary,
but invoking the 96-case evaluator is not a safe way to prove the correction with
a minimal remote check. An ad-hoc script would bypass the repository's exact Git,
contract, credential, telemetry, and privacy controls and would not provide an
auditable request bound.

The independently audited contract for commit `488f26d5` is frozen historical
evidence once this tracked implementation changes Git identity. It must not be
overwritten or reused for a future smoke.

## Decision

The repository provides a distinct `eval:final-synthesis:v2:smoke` entrypoint. It
uses the production `OpenAIResponsesFinalSynthesisV2Transport` and the same
single-attempt request construction, classification, and proof validation path as
the v2.1 evaluator. The normal evaluator retains its two-attempt policy, while the
smoke runner calls the shared single-attempt operation exactly once and has an
independent authority that rejects a second provider boundary before invocation.

The smoke uses `final-synthesis-v2-provider-smoke-v1`, a deterministic synthetic
submission that is not in the 96-case corpus. It derives ordinary evidence units
from the actual v2 input builder and uses the Conway v5 required-node/component
topology obtained from the sealed suite. Its canonical semantic-input SHA-256 is
`30460738d3ae115bbc5597a4ba7108ec4f64425a5955831b9f57cbd67a768afc`.
The fixture has no gold label, is not benchmark evidence, and does not change any
semantic identity.

Smoke execution requires the exact `FINAL_SYNTHESIS_V2_SMOKE_RUN=1` opt-in plus
the existing contract, model, and process-only API-key variables. Smoke and full
live opt-ins are mutually exclusive. Contract schema, canonical path, ignored and
untracked state, clean `HEAD == origin/main` parity, all repository identities,
candidate equality, and persistent-credential absence are checked before provider
construction. The sealed contract bytes are checked again before the single
attempt. Full-live opt-in cannot authorize smoke, and smoke opt-in cannot authorize
the 96-case evaluator.

The gitignored smoke artifact is written once under
`artifacts/eval/final-synthesis/smoke/` and hashed from its stored bytes. It records
only bounded operational identity, outcome, request count, latency, sanitized
diagnostics, request ID, token counts, and whether structured output parsed. It
contains no credential, raw prompt, synthetic submission, request, response,
proof/evidence literal, or development-corpus content. A provider-boundary failure
still produces this safe operational artifact. There is no automatic retry.

## Consequences

Normal deterministic tests and hosted CI do not run the explicit smoke entrypoint
and make no provider call. After independent audit, exact-SHA promotion to `main`,
main hosted CI, and independent closure verification, a new v2.1 Luna contract
must be frozen against the smoke-harness Git SHA and audited independently. Only a
separate authorization may then execute one provider smoke. Success would prove an
operational boundary only and would not authorize or count toward the complete
96-case development run. Final Holdout and runtime activation remain deferred;
M3 remains open.
