# Lock Verifier v1 Luna development baseline

Status: immutable development evidence; frozen acceptance gate failed

This records the first valid provider evaluation of the M3-B3 Lock Evidence
Verifier. The gitignored source artifact remains unchanged. This is development
evidence, not a Final Holdout, production promotion, or runtime decision.

## Frozen identity

- Git SHA: `8f7fda04f0fe64f63e52655fae2cdae315d712ea`
- Dataset: `lock-verifier-dev-v1`
- Prompt: `lock-verify-v1`
- Content: `conway-law` version 3
- Source Judge suite: `judge-dev-v3`
- Provider model: `gpt-5.6-luna`
- Cases: 140 (124 single-answer, 16 multi-answer)
- Source artifact: `lock-verifier-dev-v1-1788950733388.json` (gitignored,
  redacted)
- Source artifact SHA-256:
  `b6dc241a359aa80bad5754a35390d0ced9ea8c04f98fde22ab2ec7f9818dfba1`

The prompt, verifier manifest, reviewed multi-answer fixture, and Conway v3 hashes
remain those pinned by [decision 0005](../decisions/0005-m3-b3-lock-evidence-verifier.md)
and deterministic tests. Commit `8f7fda0` changed documentation only after the
credential-free acceptance contract was recorded; it did not change candidate
semantics.

## Raw artifact results

| Metric | Recorded result |
| --- | ---: |
| Approval TP / FP / FN / TN | 42 / 2 / 5 / 91 |
| Approval precision / recall | 0.9545 / 0.8936 |
| False approvals | 2 |
| Overall `VERIFIED` precision | 0.9628 |
| `TEAM_BOUNDARIES` `VERIFIED` precision | 0.9718 |
| `COMMUNICATION_FRICTION` `VERIFIED` precision | 0.9841 |
| `SYSTEM_RESEMBLANCE` `VERIFIED` precision | 0.9259 |
| Schema/application-valid cases | 139 / 140 |
| Unrecovered failures | 1 |
| Retry cases / provider failures | 1 / 0 |
| Total tokens | 130,719 |
| Latency p50 / p95 / max | 3,409 / 7,915 / 17,813 ms |
| Estimated cost | $0.0737668 |

The false approvals are `messy-rejected-quote-04` and
`messy-prior-state-02`. The unavailable case is `messy-spacing-full-04`; both
attempts failed literal-evidence validation with `EVIDENCE_NOT_LITERAL`.

## Frozen acceptance audit

| Hard gate | Result |
| --- | --- |
| Case count equals 140 | PASS |
| False approvals equal 0 | **FAIL** |
| Approval precision equals 1.0000 | **FAIL** |
| Approval recall at least 0.8500 | PASS |
| Overall `VERIFIED` precision at least 0.9500 | PASS |
| Every required-node `VERIFIED` precision at least 0.9500 | **FAIL** |
| Required regression supports exactly match | **FAIL** |
| Schema/application-valid count equals 140 | **FAIL** |
| Unrecovered failures equal 0 | **FAIL** |
| Raw-answer/evidence/prompt/provider-payload leakage equals 0 | PASS |
| Retry case rate at most 5% | PASS (1/140, 0.71%) |

The per-node precision gate fails because `SYSTEM_RESEMBLANCE` precision is
0.9259. Any one false approval is independently non-compensable. The final result
is therefore:

> **M3-B3 Luna development live gate: FAIL**

## Historical reporting limitation

The immutable artifact's evaluator treated an unavailable case as predicted
rejection for approval bookkeeping. Because `messy-spacing-full-04` is an
expected-negative case, its unavailable outcome is included in the recorded TN of
91. It is not a semantic classification result. Reporting was subsequently
repaired to separate semantic evaluated cases from operationally unavailable
cases, retain per-node FP/FN case IDs, and emit every frozen hard gate. The source
artifact and its raw metrics were not modified or regenerated.

This repair does not turn the Luna result into a PASS and does not authorize a
second Luna run.
