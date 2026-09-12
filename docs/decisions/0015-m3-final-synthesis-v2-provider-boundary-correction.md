# ADR 0015 — Final Synthesis v2 provider-boundary correction

## Status

Accepted and closed after independent audit, exact-SHA promotion to `main`, and
hosted verification. This decision still authorizes no provider call.

## Context

The first sealed Final Synthesis v2 Luna development invocation was consumed, but
it produced no model-semantic evidence. The v2 provider schema used a positional
`z.tuple(...)` for `nodes`. With the installed OpenAI SDK, local
`zodTextFormat(...)` conversion rejected that Draft-7 tuple shape before
`responses.parse(...)` was invoked. All cases therefore became operationally
unavailable without a provider request ID or token usage.

Two observability errors obscured the incident. The v2 adapter classified the
local construction exception through an over-broad `PROVIDER_UNAVAILABLE`
fallback, and its independent execution counter advanced before local request
construction. The historical contract and abnormal artifact remain immutable and
retain their original interpretation; this decision does not rewrite them.

## Decision

The provider extraction schema uses a strict array of node records instead of a
positional tuple. It constrains identifiers and array bounds, while
`validateFinalSynthesisV2ProofStructure(...)` remains the sole authority for the
exact node set, uniqueness, component membership, topology, evidence identifiers,
and reference rules. The provider-free v2 preflight now constructs all 96 real
development requests and rejects tuple-form `items` or `additionalItems`.

Provider execution is counted only after local request construction succeeds and
immediately before entering the injected SDK request invoker. Local construction,
provider/API, network/transport, and unknown execution failures have distinct
categories. Attempt artifacts retain only bounded structured diagnostics: class,
sanitized code, HTTP status, request ID, retry-after, and a bounded redacted
message when available. They never retain API credentials, request/response
bodies, synthesis or evidence text, or the system prompt.

The evaluator identity is revised from `final-synthesis-eval-v2` to
`final-synthesis-eval-v2.1`. Dataset, corpus, revision ledger, prompt, proof
contract, product contract, content identity, retry policy, and semantic
acceptance thresholds are unchanged. A corrected future run therefore requires a
new contract frozen against corrected hosted-verified code.

Semantic metrics are acceptance-authoritative only for 96 evaluated cases. Zero
evaluated cases report `N/A — ZERO EVALUATED CASES`; a nonzero incomplete run
reports `PARTIAL — NOT ACCEPTANCE-COMPLETE` and computes descriptive metrics only
over evaluated cases. Operational failures continue to fail closed.

## Consequences

This ADR authorized no provider smoke, Luna rerun, Final Holdout work, or production
runtime activation. Its corrected v2.1 Luna contract was subsequently frozen and
independently audited at commit `488f26d5`. A tracked, audited one-request harness
is the next dependency before any separately authorized provider smoke. The
complete development run remains separately gated, and M3 remains open.
