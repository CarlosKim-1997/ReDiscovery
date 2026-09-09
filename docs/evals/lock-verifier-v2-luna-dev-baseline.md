# Lock Verifier v2 Luna development baseline

This document records immutable, redacted development evidence. It is not a
candidate acceptance, Final Holdout result, or production model decision.

## Identity

| Field | Value |
| --- | --- |
| Timestamp | `2026-09-09T13:43:06.398Z` |
| Git SHA | `e44a0789c127d055c313a5c79285c920ed3ec7aa` |
| Dataset | `lock-verifier-dev-v2` |
| Prompt | `lock-verify-v2` |
| Content | `conway-law` v3 |
| Model | `gpt-5.6-luna` |
| Cases | 164 |
| Local artifact | `lock-verifier-dev-v2-1788961386434.json` |
| Artifact SHA-256 | `22a0252c127c21d1676b8ad4ff3648d2e7ed8e2b333e23e38f54e88bf4cd8242` |
| Result | **FAIL** |

## Availability and approval

- Evaluated: 158
- Unavailable: 6
- Approval TP / FP / FN / TN: 51 / 6 / 6 / 95
- Approval precision: 0.8947
- Approval recall: 0.8947
- False approvals: `messy-decision-only-03`, `messy-prior-state-02`,
  `messy-rejected-quote-04`, `messy-spacing-full-04`, `seed-020`,
  `v2-reference-ambiguous-01`
- False rejections: `messy-hedging-02`, `messy-self-correction-04`,
  `messy-spacing-full-03`, `messy-typo-full-04`, `messy-unicode-full-01`,
  `multi-communication-group-01`

Overall VERIFIED precision was 0.9464. Required-node VERIFIED precision was
0.9518 for `TEAM_BOUNDARIES`, 0.9740 for `COMMUNICATION_FRICTION`, and 0.9063
for `SYSTEM_RESEMBLANCE`.

All six unavailable cases exhausted the bounded retry with
`PROOF_RECORD_INVALID`: `messy-correct-then-contradict-04`,
`multi-strong-communication-generic-output-01`, `v2-endorsement-abandoned-01`,
`v2-format-spacing-01`, `v2-format-unicode-01`, and
`v2-relation-influence-01`. There were no provider-error attempts.

## Operations and privacy

- Retry count: 8
- Retried cases: 8
- Retry-case rate: 0.0488
- Latency p50 / p95 / max: 4,922 / 9,887 / 21,991 ms
- Input / output / total tokens: 153,708 / 64,992 / 218,700
- Estimated cost: USD 0.108732
- Raw-answer, prompt, or provider-payload leakage: 0

Deterministic evidence units removed the v1 literal-copy operational failure for
`messy-spacing-full-04`: the case became evaluable. Its v2 result was still a
semantic false approval, so evidence provenance improved while semantic Lock
safety did not.

V3 therefore receives new identities. Same-answer and cross-answer references
share one supplied-evidence model, node proof is decomposed into human-approved
required components, and rejected structured proofs gain redacted deterministic
failure diagnostics. The v2 artifact, prompt, dataset, labels, and result remain
immutable.
