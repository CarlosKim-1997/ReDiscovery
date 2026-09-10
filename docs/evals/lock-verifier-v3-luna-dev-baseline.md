# Lock Verifier v3 Luna development baseline

This document records immutable, redacted development evidence. It is not a
candidate acceptance, Final Holdout result, or production model decision. The
raw artifact remains gitignored and is not reproduced here.

## Identity

| Field | Value |
| --- | --- |
| Timestamp | `2026-09-10T02:23:32.575Z` |
| Git SHA | `e7d72a1dd29f064a29337fe85946e0ab34ee4f1d` |
| Model | `gpt-5.6-luna` |
| Dataset | `lock-verifier-dev-v3` |
| Prompt | `lock-verify-v3` |
| Proof contract | `lock-proof-v3` |
| Content | `conway-law` v4 |
| Cases | 170 |
| Local artifact | `lock-verifier-dev-v3-1789007012621.json` |
| Artifact SHA-256 | `7f90458bbc5fd8721c3b3eedc8e5d05c5499fbf489784c0f63f19d70e7a99808` |
| Result | **FAIL** |

## Frozen result

- False approvals: 3
- Approval precision: 0.9375
- Approval recall: 0.7377
- Overall VERIFIED precision: 0.9378
- `SYSTEM_RESEMBLANCE` VERIFIED precision: 0.8772
- Schema/application valid: 168/170
- Required regression exact matches: 24/33
- Retry-case rate: 0.0529
- Raw-answer, prompt, or provider-payload leakage: 0

Componentization improved provenance and diagnostic visibility, but it did not
make semantic Lock approval safe. The same model could classify every required
component as complete for an insufficient proposition. Deterministic derivation
cannot recover safety after those component judgments are over-positive.

The pre-declared architecture stop-rule is therefore **REACHED**. This v3
candidate is **NOT ELIGIBLE** for identity freeze. Luna reruns, prompt-tuning
loops, model escalation, Final Holdout creation or consumption, and runtime
integration are not authorized by this result. The Final Holdout remains
**UNCREATED / UNCONSUMED**, and M3 remains open.
