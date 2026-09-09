# Lock Verifier Final Holdout Composition Contract

Status: frozen before case creation

This document is the canonical composition contract for
`lock-verifier-final-holdout-v1`. The execution, sealing, consumption, and
acceptance rules are defined by the
[Final Holdout Protocol](lock-verifier-final-holdout-protocol.md). This contract
contains no case text and does not create the sealed artifact.

## Frozen identity and counts

| Field | Frozen value |
| --- | --- |
| Dataset identity | `lock-verifier-final-holdout-v1` |
| Schema version | `1` |
| Total cases | `120` |
| Expected-positive approvals | `40` |
| Expected-negative approvals | `80` |
| Single-answer cases | `60` |
| Multi-answer cases | `60` |

The exact `60/60` answer structure is fixed before authorship. A multi-answer case
represents one current-session reasoning sequence spread across multiple submitted
answers. The higher multi-answer share than the 16/140 development corpus reflects
production interaction, where initial reasoning, Guidance, additions, and
self-correction occur across turns.

Every case must include expected support for the complete required-node set. A
positive case has every required node `VERIFIED`; a negative case has at least one
required node `INSUFFICIENT`. The final metadata must report per-node label counts
and must contain both labels for every required node. Exact per-node quotas are not
fixed here because cases should combine realistic semantic properties rather than
be templated around a matrix.

## Required semantic coverage

The 120 cases collectively must include all of the following. A case may and should
combine multiple properties where that resembles real user input:

- complete rediscovery without typical theory, team, or module vocabulary;
- a complete proposition expressed with hedging;
- a team/group boundary without a communication difference;
- a communication difference without final structural reflection;
- generic statements that something merely "has an influence";
- bare similarity;
- reverse causal direction;
- keyword stuffing;
- a rejected quotation;
- explicit self-correction;
- contradiction followed by a later correction;
- weak evidence followed by strong evidence;
- strong evidence followed by weakening or contradiction;
- required nodes split across answers;
- ambiguous reference;
- colloquial Korean;
- grammar, spelling, and spacing errors;
- a long but semantically empty answer;
- a short but structurally complete answer;
- terminology-only answers;
- partial overlap;
- multiple plausible interpretations; and
- later evidence that legitimately completes earlier partial reasoning.

Coverage tags are audit metadata, not hints supplied to the verifier. The artifact
review must confirm every required category is represented and that categories are
mixed naturally rather than generated as one-feature templates.

## Creation independence and seal metadata

No case may be created through mechanical transformation, paraphrase, or surface
word substitution of `judge-dev-v3` or `lock-verifier-dev-v1`. Authors must not
tailor cases to Luna/Terra development failures or to `lock-verify-v1` wording.
A manual pre-seal audit must find no substantive sentence or expression overlap
with the current development corpus.

The following fields are intentionally unpopulated until the later creation and
review process completes; all are mandatory before v1 becomes eligible:

- actual creation date;
- SHA-256 of the exact sealed artifact bytes;
- completed labeling/review record;
- per-node `VERIFIED`/`INSUFFICIENT` counts; and
- manual development-overlap audit result.

Changing any frozen count, dataset identity, schema version, or required coverage
after case creation requires a new composition-contract version and a new sealed
holdout identity. Case text remains outside the public repository.
