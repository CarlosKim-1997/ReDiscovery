# 0009 — M3 Lock Evidence Acquisition Redesign: Final Synthesis Gate

**Status:** Provider-free foundation implemented; runtime and evaluation design not started.

## Context and decision

The first Lock Verifier v3 Luna development run failed its frozen gate and
reached the architecture stop-rule. Its immutable redacted result is recorded in
the [v3 Luna development baseline](../evals/lock-verifier-v3-luna-dev-baseline.md).
V3 remains historical evidence and is not an accepted or frozen candidate.

M3 adopts **Final Synthesis Gate** as the stable product and architecture term.
Instead of asking a verifier to reconstruct final meaning across several free-form
turns, a future session will ask the user to author one self-contained final
synthesis. The ability to formulate that conclusion explicitly is part of the
evidence of self-discovery.

This foundation introduces no runtime behavior. It adds development-only content
schema v3 and `conway-law` v5, a provider-neutral semantic input port, exact
synthesis-local evidence units, and deterministic `final-synthesis-proof-v1`
validation and derivation. There is no provider prompt, adapter, dataset, model
decision, persistence, API, UI, or scheduled content change.

## Semantic authority

A future Final Synthesis verifier may receive only:

- required node IDs;
- their approved server-only proof component IDs and descriptions;
- one user-authored Final Synthesis submission; and
- deterministic evidence units built only from that submission.

Previous answers, Judge verdict or accumulated state, `priorConfirmedState`,
Guidance, Reveal data, historical identity, expected labels, evaluation rationale,
generated summaries, and previous verifier proofs are not semantic evidence.
There is no fallback to prior turns.

## Entry and submission policy

Future runtime entry has exactly two classes: the validated existing full semantic
eligibility condition, or exhaustion of the existing bounded Thinking/Correction/
Rescue path. There is no looser candidate-ready threshold. Once a new-architecture
session enters Final Synthesis, it does not return to normal Thinking, and Final
Synthesis submissions do not consume `turnCount`.

The generic server-only content policy is:

```text
contract_version = final-synthesis-v1
max_chars = 500
max_submissions = 2
```

Submission one may lead to future `LOCKED`; an insufficient result permits one
deterministic generic clarification and a final rewrite. Submission two may lead
to future `LOCKED`; an insufficient result leads to future `REVEAL_READY`. Skip
also leads to future `REVEAL_READY`. There is no third submission, post-synthesis
LLM Rescue, or return to Thinking.

The intended future vocabulary is `SYNTHESIS_READY`, `SYNTHESIS_EVALUATING`, and
`REVEAL_READY`. Existing `LOCKABLE` remains untouched for current and historical
runtime compatibility. New architecture will reserve `LOCKED` for successful
synthesis verification. `COMPLETED_WITHOUT_LOCK` is not introduced: phase and
outcome must not be conflated. Whether a revealed session achieved verified
self-discovery remains an open persistence-design decision.

```text
THINKING / existing RESCUE completion
        ↓
SYNTHESIS_READY
        ↓ submission
SYNTHESIS_EVALUATING
      ↙       ↘
   PASS       FAIL #1
    ↓           ↓
 LOCKED    SYNTHESIS_READY
                ↓ second submission
        SYNTHESIS_EVALUATING
              ↙       ↘
           PASS       FAIL
            ↓           ↓
         LOCKED     REVEAL_READY
            ↓           ↓
             → future REVEALED
```

Skip from `SYNTHESIS_READY` also leads to `REVEAL_READY`. This diagram is a
future contract only; the canonical runtime state machine and persistence schema
do not yet contain these states or transitions.

## Self-contained contract

The Final Synthesis must contain all semantic material required to interpret the
user's final conclusion. A complete proposition must exist inside the submission.
External references such as “아까 말한 것”, “전에 말했듯”, “그 구조”, or “그것
때문에” are insufficient when their antecedent is absent from the synthesis.

Multiple sentences and references within the synthesis are permitted. A
`RESOLVED_WITHIN_SYNTHESIS` proposition may select one or more distinct antecedent
units only when every required reference resolves uniquely to earlier units in
the same synthesis. `UNRESOLVED` and `AMBIGUOUS` references are insufficient and
cannot carry antecedent IDs.

Grammar, spelling, spacing, style, canonical terminology, and verbosity do not
establish correctness. A theory name or keywords alone are insufficient. Quoted,
rejected, contradicted, or abandoned claims are not positive proof. A correction
is usable only when the final replacement proposition is explicit.

## Proof and deterministic authority

`final-synthesis-proof-v1` retains the useful v3 component-proof facts:
component identity, endorsement, reference status, component match, evidence unit
IDs, and antecedent unit IDs. It is a new task identity, not `lock-proof-v4`.

The provider-neutral proof cannot contain `VERIFIED`, `INSUFFICIENT`, Lock,
eligibility, or score fields. Deterministic application code validates exact
node/component coverage and evidence structure. A component is satisfied only
when it is currently endorsed, self-contained or resolved within the synthesis,
completely matches its requirement, and has valid evidence. A node is VERIFIED
only when every required component is satisfied; eligibility requires every node
to be VERIFIED.

Evidence units use exact UTF-16 spans and stable `synthesis:uN` IDs. They retain
the submitted substring without normalization. There is no answer order,
cross-answer provenance, prior-answer antecedent, or multi-answer validation.

## Deferred gates

The retry clarification will be deterministic generic product copy and disclose
no failed component or hidden vocabulary, but UI copy is not implemented here.
Development dataset and prompt design are separate later gates. Existing 170-case
multi-turn evidence cannot be treated as a new Final Synthesis suite.

The sealed Final Holdout remains uncreated and unconsumed. Its sealing,
single-consumption, and conservative acceptance principles remain relevant, but
its composition must be redesigned before creation because the semantic task has
changed to one self-contained synthesis.
