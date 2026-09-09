# 0007 — M3-B3 Lock Verifier v2 factorized proof contract

**Status:** Accepted for provider-free development; live evaluation pending.

## Decision

`lock-verify-v2` does not ask a provider for `VERIFIED`, `INSUFFICIENT`, or a Lock
decision. Deterministic application code first splits only at strong sentence
punctuation (`.?!。？！`) and line boundaries and assigns stable answer-local unit IDs
to exact UTF-16 spans. It does not normalize Unicode or internal spacing.

For each required node, the provider reports only endorsement status, reference
status, semantic-match strength, selected evidence-unit IDs, and—only for a unique
cross-answer reference—separate antecedent-unit IDs. Application validation checks
the exact node set, deterministic unit list, unit existence, unique selections,
and cross-answer antecedent structure.

A node is derived as `VERIFIED` only when endorsement is `ENDORSED`, the reference
is self-contained or uniquely resolved within supplied answers, semantic match is
`COMPLETE_NODE_MATCH`, and the evidence record is valid. Everything else is
insufficient or, for malformed proof/application data, unavailable. Lock approval
is the deterministic conjunction of all required-node results. There is no
provider-controlled binary escape hatch.

## Identities and evaluation

V1 remains immutable and independently reproducible. V2 uses the distinct
`lock-verify-v2` prompt and `lock-verifier-dev-v2` dataset. The latter inherits all
140 v1 cases unchanged and adds 24 development-only, failure-taxonomy-derived
regressions: six each for reference, relation strength, endorsement, and evidence
format. They are calibration material, not Final Holdout cases.

The future 164-case live gate requires: exact case count; zero false approvals;
approval precision 1.0000 and recall at least 0.8500; overall and every required
node VERIFIED precision at least 0.9500; exact match on every required regression;
164/164 schema/application validity; zero unrecovered failures; zero raw-data
leakage; and retry-case rate at most 5%. False approval is non-compensable.
Latency, tokens, and cost are observational.

## Boundaries

This candidate is evaluator-only. It is not registered in the server composition
root, called from gameplay, or persisted. The OpenAI SDK and request construction
remain adapter-side. No Final Holdout case, runtime integration, Daily change,
Judge change, or production model decision is made here.
