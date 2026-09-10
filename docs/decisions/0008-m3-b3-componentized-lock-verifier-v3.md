# 0008 — M3-B3 componentized Lock Verifier v3

**Status:** Accepted for provider-free development; live evaluation not run.

## Decision

Lock Verifier v3 is a new major development identity: `lock-verify-v3`,
`lock-verifier-dev-v3`, `lock-proof-v3`, `lock-verifier-eval-v3`, and
development-only `conway-law` v4. V1, v2, and
content v1-v3 remain immutable.

The canonical four content layers remain unchanged. Content schema version 2
adds a server-only `SERVER_POLICY.lock_verifier` contract. It defines generic,
human-authored required proof components for every required Lock node. Historical
schema version 1 rejects this field and continues to parse without reinterpretation.

The provider returns component-local endorsement, reference, match, and evidence
unit IDs. It cannot return binary support, Lock, a score, or policy eligibility.
Provider-neutral application code validates the exact node/component sets and
derives a node as VERIFIED only when every required component is endorsed,
admissibly referenced, completely matched, and structurally valid.

## Reference and evidence order

`UNIQUE_WITHIN_SUPPLIED_EVIDENCE` replaces the answer-boundary-specific v2
status. Every reference required by the selected component proposition must have
exactly one explicit antecedent in supplied evidence. One proposition may require
several antecedent units, including units from several earlier answers; same-answer
earlier units also remain admissible. Canonical ordering uses supplied answer
order, then the exact UTF-16 unit start/end. All antecedent units must precede the
first referring unit. The validator proves only scope, identity, and order;
semantic uniqueness remains a conservative model judgment. If any required
reference is ambiguous or unresolved, the component derives insufficient.

Only required node/component definitions and deterministic evidence units enter
the provider payload. Judge results, prior state, Guidance, Reveal content,
expected labels, case IDs, and evaluation rationales remain excluded.

## Conway v4 Lock burden

`TEAM_BOUNDARIES` requires `ACTOR_GROUPING`.
`COMMUNICATION_FRICTION` requires `COMMUNICATION_DIFFERENCE`.
`SYSTEM_RESEMBLANCE` requires `SOURCE_BOUNDARY`, `OUTPUT_STRUCTURE`, and
`STRUCTURAL_CORRESPONDENCE` independently. Generic relatedness, influence,
causation, continuation, or “leads to” language without an explicit mapping of
source and output structure cannot complete structural correspondence. This is a
Lock proof burden and does not rewrite the frozen Judge v3 rubric or labels.

## Development and diagnostics

The v3 suite preserves all 164 v2 surface answers, stable IDs, provenance, and
node expectations and adds exactly six approved development cases, for a hard cap
of 170. The complete inherited ID/provenance/answer/expectation/rationale projection is pinned by
SHA-256 `40f618bb942354802fbcd30d63444bfd396862fc3a1f59fcef0fdcb9347bbc57`,
so rebuilding it through the frozen v2 source reader cannot silently drift. Every
v2 required regression and all six v3 cases require exact node-level support
matches.

Stable coarse failure categories remain. Schema-valid rejected proofs may retain
only node/component statuses, unit IDs, the coarse category, and a deterministic
validation reason. Raw answers, unit text, prompts, raw requests, and provider
responses are forbidden and checked before artifact write.

The future 170-case Luna development run retains the frozen eleven hard gates.
Component observations are diagnostic, not additional acceptance gates. V3 stays
offline/evaluator-only: no runtime composition, persistence, Daily, or Final
Holdout behavior changes here.

## Provider-free identity hashes

| Identity | SHA-256 |
| --- | --- |
| `lock-verify-v3` prompt | `be86c4fe20921d866b9774892b893812d9348acdfa993a9d8256f95d38fbf5bd` |
| v3 manifest | `f41f8a964ee90309712af700e84a8708a60507beb1ca3663efb590af962a0382` |
| six v3 targeted cases | `b2474b471a10bcc6637a0ce0cbc36d550f353b0f7645232443369762bc9e5047` |
| `conway-law` v4 file | `c57fb6171c0fc281c495c8d6500ae81cb2eec72ed7a54c77f1a17295e53c747b` |

Before any v3 provider run, the reference clarification changed only the v3
prompt string hash from
`a6a698a889085e7f6b4a5fc95a0cce119b0acce03d2d06ea92fa0c080a11fc36`
to `be86c4fe20921d866b9774892b893812d9348acdfa993a9d8256f95d38fbf5bd`.
The `lock-verify-v3` major identity is retained.
