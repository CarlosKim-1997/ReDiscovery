# 0006 — Single-use Final Holdout and M3 closure contract

Status: accepted protocol; M3 remains open

## Authority

The Master Packet identified by [`docs/spec-authority.md`](../spec-authority.md)
remains canonical. This decision is the M3-level authority for Final Holdout use
and closure. The [Final Holdout Protocol](../evals/lock-verifier-final-holdout-protocol.md)
owns execution and acceptance rules, and the
[composition contract](../evals/lock-verifier-final-holdout-composition-contract.md)
owns dataset identity and counts. [`docs/milestones/M3.md`](../milestones/M3.md) is
the status/evidence index and cannot relax these contracts.

## Decision

Use an independently authored, sealed, single-use Final Holdout to answer only
whether a frozen Lock Evidence Verifier avoids approving semantic self-discovery
that the user did not express. False approval is non-compensable. Freeze model,
prompt, content, evaluator, required-node semantics, validation logic, and retry
policy after a development live PASS and before holdout exposure.

The v1 composition is exactly 120 cases: 40 expected-positive and 80
expected-negative approvals, with 60 single-answer and 60 multi-answer cases.
Raw case text stays outside public Git. A holdout is consumed on first plaintext
exposure to a candidate or its evaluation process and cannot accept a candidate
modified after results are seen.

At the time of this decision, no Final Holdout case text or artifact has been
created, no Final Holdout or Lock Verifier development provider run has been
executed as part of this work, and no runtime Lock integration has started.

## M3 Closure Contract

M3 may be declared `CLOSED` only when all of the following are true and linked to
immutable evidence:

1. M3-A deterministic, local, and hosted gates are complete.
2. M3-B1 is complete.
3. M3-B2 is complete and immutable live records exist.
4. M3-B3 deterministic validation is complete.
5. M3-B3 hosted CI is complete.
6. The final Lock Verifier candidate passes the development live gate.
7. The model, prompt, content, evaluator, required-node semantics, validation
   logic, and retry-policy identity is frozen.
8. The frozen candidate passes one eligible sealed Final Holdout exactly once.
9. All privacy, schema/application-validation, failure-recovery, leakage, and
   retry-rate gates in the Final Holdout Protocol pass.
10. Immutable, redacted evaluation evidence and its hashes are recorded.
11. A production-candidate model/prompt decision record is written.
12. Final M3 documentation is reconciled against the evidence and authority chain.
13. The working tree is clean.
14. Hosted CI passes for the exact closure commit.

No item may be waived by aggregate metrics. In particular, one Final Holdout false
approval fails items 8 and 9.

## Milestone boundary

M3 closes as the Judge / Lock Verifier reliability-validation milestone. `CLOSED`
does not mean the verified Lock Verifier is connected to the gameplay Lock flow.
Production runtime integration belongs to a later authorized milestone.

This decision does not authorize provider execution, holdout case creation,
production promotion, Judge or verifier changes, prompt changes, dataset relabeling,
runtime integration, or any M4 capability.
