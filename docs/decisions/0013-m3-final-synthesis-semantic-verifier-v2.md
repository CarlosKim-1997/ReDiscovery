# ADR 0013: Final Synthesis semantic verifier v2

## Status

Accepted for provider-free development. Candidate model is **UNSELECTED**. Runtime activation and Final Holdout work are not authorized.

## Context

The immutable first `final-synthesis-dev-v1` Luna run failed. Its artifact remains historical evidence. Forensics found systematic coupling between endorsement and component match, reference resolution and component match, and structural relations and their constituent components. The v1 report also discarded recovered-attempt failure details and did not retain redacted proof facts for every evaluated case.

## Decision

Create separate `final-synthesis-proof-v2`, `final-synthesis-verify-v2`, `final-synthesis-dev-v2`, and `final-synthesis-eval-v2` identities. The product contract remains `final-synthesis-v1`, content remains unscheduled Conway v5, and runtime continues to use only its accepted fake/unavailable wiring.

Proof v2 makes endorsement, reference resolution, and local component shape orthogonal. `NOT_APPLICABLE` is valid only with `NO_COMPONENT_SUPPORT`; that canonical record has empty evidence arrays. Every other match requires evidence and non-applicable statuses are forbidden. A complete relationship cannot establish missing actor, communication, source-boundary, or output-structure constituents.

When several propositions concern one component, one canonical proposition is selected: a unique current endorsed proposition takes precedence; incompatible current propositions are mixed; quoted or rejected propositions are considered only when no current proposition exists; an abandoned proposition is considered only when neither current nor quoted/rejected propositions exist. A current replacement remains endorsed. Full five-component gold must reproduce all 480 expected component booleans through deterministic derivation.

The v2 dataset has an explicit per-case provenance ledger. Text or gold changes are justified from the v2 contract, never from copying Luna's prediction. Twenty-four new critical regressions are reviewed under v2 semantics.

Evaluator v2 preserves redacted telemetry for every execution, including recovered attempts and exact application validation reasons. An observer at the transport invocation boundary supplies provider-execution counts independently from adapter attempt records. Hard gates compare both totals and per-case counts, validate attempt sequences and terminal failures, and reconstruct deterministic component/node results from complete redacted proof facts. Raw synthesis, evidence text, prompt bodies, and provider bodies remain forbidden.

## Consequences

V1 files, manifest, run contract, and first-run artifact are immutable. V2 must pass provider-free local and hosted audit before a candidate model can be selected. Final Holdout remains uncreated and unconsumed; M3 remains open.
