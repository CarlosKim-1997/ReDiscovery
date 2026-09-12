# ADR 0014: Final Synthesis verifier v2 live sealing

## Status

Accepted for provider-free implementation. Candidate model remains **UNSELECTED**. No live evaluation, production activation, or Final Holdout work is authorized by this decision.

## Context

The historical v1 evaluator has a sealed run-contract and live-entry path, but that contract is version-specific. It cannot validate the v2 dataset, revision ledger, proof contract, product contract, evaluator identity, or v2 artifact requirements. Creating a v2 candidate contract before defining a tracked validator would leave the candidate identity dependent on an invented, unvalidated format.

## Decision

V2 uses a separate strict run-contract with `schema_version: 2`. It contains only `git_sha`, dataset and corpus identity, revision-ledger identity, prompt identity, proof and product contract identities, evaluator identity, content identity, and a nonempty candidate model. Missing or unknown fields are rejected. The tracked v2 manifest remains candidate-neutral.

Contract validation and live entry are separate operations. Provider-free validation requires no opt-in or credential and verifies the schema, canonical real path, ignored/untracked status, clean worktree, `HEAD == origin/main`, `0/0` divergence, and every repository-derived identity. This is the path used by a later candidate-freeze gate.

Live entry additionally requires `FINAL_SYNTHESIS_V2_LIVE_RUN=1`, `FINAL_SYNTHESIS_V2_RUN_CONTRACT`, and `FINAL_SYNTHESIS_V2_MODEL` exactly matching the contract. Known persistent credential files are rejected by existence only, and `OPENAI_API_KEY` must be supplied process-only. Provider construction occurs only after every check succeeds. The explicit `pnpm eval:final-synthesis:v2` command is excluded from ordinary tests and hosted deterministic CI.

The contract bytes are read once, hashed, and frozen in memory before provider construction. A live artifact records schema version, Git, dataset/corpus/ledger, prompt, proof/product/evaluator, content, model, run-contract hash, and timestamp. Contract mutation before artifact write is rejected. No synthesis, evidence text, prompt body, provider request, provider response, or credential is added to the artifact.

## Consequences

The v1 command and historical identities remain unchanged. This gate creates no real run contract and makes no provider call. After local audit and hosted verification, the next dependency is a separate v2 Luna candidate-freeze gate. Final Holdout remains uncreated and unconsumed, production runtime remains fail-closed, and M3 remains open.
