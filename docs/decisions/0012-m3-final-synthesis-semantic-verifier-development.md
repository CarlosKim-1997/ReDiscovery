# 0012 — M3 Final Synthesis Semantic Verifier Development

**Status:** Provider-free local implementation and deterministic validation complete;
commit audit and hosted CI pending.

## Decision

The development semantic task is the **Final Synthesis Gate**. Its immutable
identities are `final-synthesis-v1`, `final-synthesis-proof-v1`,
`final-synthesis-verify-v1`, `final-synthesis-dev-v1`, and
`final-synthesis-eval-v1`, evaluated against unscheduled `conway-law` v5. No
candidate model or pricing is selected in the development manifest.

The provider's complete semantic authority is the required node IDs, approved
server-only component IDs and descriptions, one user-authored Final Synthesis,
and deterministic synthesis-local evidence units derived from that text. Prior
answers, Judge state, Guidance, Reveal material, historical identity, expected
labels, rationales, and any other session context are excluded without fallback.

The provider returns only the existing endorsement, reference, component-match,
evidence-unit, and antecedent-unit proof facts. It cannot return support, Lock
eligibility, scores, or a verdict. `deriveFinalSynthesisVerification()` and
`isFinalSynthesisEligible()` remain the only support and eligibility authority.

## Prompt and adapter boundary

`final-synthesis-verify-v1` treats the submission as untrusted data, judges each
component locally, explicitly excludes Judge state, evaluation metadata and
common-sense gap filling, permits only uniquely
resolved earlier antecedents within the same synthesis, and distinguishes
structural correspondence from generic influence. The OpenAI adapter remains
isolated under `src/adapters/`, disables SDK retries and storage, disables tools,
uses strict dynamic structured output, and performs at most two provider
executions for operational or invalid-proof failures. A valid insufficient proof
is never retried.

The adapter is not runtime-composed. Test continues to use the deterministic fake;
all non-test environments continue to fail closed.

## Development evidence and acceptance

The corrected corpus contains exactly 96 independently authored self-contained
syntheses: 32 eligible and 64 ineligible, crossed as 48 single-unit and 48
multi-unit cases. It inherits none of the historical 170 Lock Verifier cases.
At least 24 cases exercise 100–500 UTF-16-unit inputs, including near-limit,
long-reference, contradiction, correction, distractor, and injection cases.
At least 12 ineligible cases retain complete structural correspondence while a
different required component fails, preventing a universal correspondence-label
shortcut. Negative cases must span at least eight component-failure signatures,
with no signature exceeding half of the negative set. Primary categories describe
the actual semantic challenge; tags are diagnostic only. Every v5 proof component
is attacked by at least eight negative cases, and 24 editorially unambiguous cases
freeze selected proof facts as critical regressions.

The live development gate requires all of the following:

1. 96 cases and 96 schema/application-valid outcomes;
2. zero false approvals and approval precision 1.0000;
3. approval recall at least 0.8500 (at least 28 of 32 positives);
4. micro and every-node VERIFIED precision at least 0.9500;
5. micro and every-component satisfied precision at least 0.9500;
6. every critical proof-fact regression exact-matches;
7. zero unrecovered failures and zero leakage;
8. retry-case rate at most 0.05 (at most 4 of 96 cases).

False approval is non-compensable. Latency, tokens, and cost are observational.
Reports contain IDs, derived labels, redacted proof facts and operational
aggregates, never synthesis text, prompt text, provider bodies, evidence text,
component descriptions, or credentials.

## Live-run freeze and deferred scope

A live command requires a separate run contract under the canonical gitignored
`artifacts/eval/final-synthesis/run-contracts/` root that exactly freezes
git, corpus, prompt, proof, evaluator, content, and candidate-model identities,
plus `FINAL_SYNTHESIS_LIVE_RUN=1`. The evaluator resolves real paths, rejects
outside-root or tracked/non-ignored contracts, and requires an entirely clean Git
worktree. Every seal and identity check completes before provider construction.
This decision creates no candidate run contract, chooses no model, and makes no
provider call.

Production activation, a live development run, candidate freeze, Final Holdout
redesign/creation/consumption, and M3 closure remain deferred. M3 remains OPEN;
the Final Holdout remains UNCREATED / UNCONSUMED.
