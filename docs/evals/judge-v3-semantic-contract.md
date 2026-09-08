# Judge v3 semantic contract

Judge v3 remains a stateless current-answer classifier. Deterministic application
policy alone merges history and decides guidance, Lock, and Reveal. Production and
Daily remain on v1.

## Universal semantics

- `DISCOVERED` is the complete relationship required by the content rubric.
  `PARTIAL` is relevant but structurally incomplete; uncertainty alone does not
  downgrade a complete proposition. `ABSENT` has no usable proposition.
  `CONTRADICTED` is a currently endorsed incompatible proposition.
- A rejected quotation, abandoned claim, or clear self-correction is not currently
  endorsed. NodeStatus and Ambiguity remain independent.
- `EMPTY` is limited to no substantive linguistic content. A nonempty keyword list,
  theory or answer-label attempt, or game/evaluation statement is `META` unless it
  independently contains causal reasoning.
- `CONFLICTING_CLAIMS` applies whenever incompatible claims remain endorsed,
  regardless of their order. A clear retraction or rejection resolves the conflict.
- Non-ABSENT evidence must be the shortest sufficient literal substring occurring
  exactly once in the current answer. ABSENT requires null evidence. No evidence may
  come from prior state or guidance.

## Conway v3 ontology

- `TEAM_BOUNDARIES`: a communication-defined actor group is an explicit boundary;
  the words “team” or “organization” are unnecessary. Merely naming an undivided
  set of people or an organization is incomplete.
- `COMMUNICATION_FRICTION`: an explicit or semantically entailed difference in who
  can communicate, frequency, ease/difficulty, cost, reach/access, or communication
  occurring within one group rather than across another is DISCOVERED. Thus meanings
  such as “서로 자주 말할 수 있는 사람끼리”, “말 자주 섞는 애들끼리”, and
  “대화 가능한 범위 안에서” are complete without a literal outside comparison.
  Mere “소통”, “대화”, or “협업” remains PARTIAL.
- `DECISION_CLUSTERING`: actual local decision, judgment, coordination, or design
  partitioning is required. Merely performing work or building functions together
  is PARTIAL. This conservative choice avoids inferring decision locality from
  co-production.
- `SYSTEM_RESEMBLANCE`: the output-side structure must be downstream of, produced
  by, follow, reflect, or otherwise correspond as a consequence of organizational,
  communication, or locally clustered design boundaries. Bare similarity,
  correlation, or generic influence is PARTIAL. An endorsed denial or opposite
  causal direction used as the replacement mechanism is CONTRADICTED. Mentioning
  reverse causality only to reject it is not.

## Audited v2 to v3 label delta

| Case ID | V2 | V3 | Contract rationale |
| --- | --- | --- | --- |
| `seed-013` | DC DISCOVERED | DC PARTIAL | “기능도 붙여 만들게” states co-production, not local design or decision partitioning. |
| `messy-colloquial-01` | DC DISCOVERED | DC PARTIAL | “같이 만들고” likewise establishes joint work only. |
| `messy-resemblance-only-01` | SR DISCOVERED | SR PARTIAL | “비슷하다” is bare structural similarity without output-downstream framing. |
| `messy-resemblance-only-02` | SR DISCOVERED | SR PARTIAL | “닮았다” states resemblance but no causal/reflection direction. |
| `messy-resemblance-only-04` | SR DISCOVERED | SR PARTIAL | Overlapping shapes state correlation only and do not identify the output as consequence. |

No label was changed because of Luna's prediction. The v3 ledger verifies each v2
`from` value before applying the contract-derived `to` value.

The explicitly requested audit left the following unchanged: `messy-spacing-full-03`
has explicit decision concentration and product reflection; `messy-unicode-full-04`
has a communication-defined group, design scope, and output reflection;
`messy-verbose-full-03` states constrained joint design decisions and an accumulated
downstream result; `messy-team-only-04` states a team boundary only; all
`messy-decision-only-*` cases state local design/decision partitioning except that
their existing communication distinction remains governed by the communication
threshold; and `messy-resemblance-only-03` uses the directional verb “reflects.”
The contradiction audit also left exact expectations unchanged:

- `messy-wrong-causal-vocabulary-01..04` remain SR CONTRADICTED because each
  endorses system/product/design → organization/communication as the replacement
  mechanism.
- `messy-negation-01..04` remain SR CONTRADICTED because each endorses no relevant
  relationship; none merely quotes or rejects that denial.
- `messy-correct-then-contradict-01..04` remain `CONFLICTING_CLAIMS` with SR
  CONTRADICTED because both incompatible claims remain endorsed; their final
  contradiction is not a clear self-correction.
- Seed contradiction cases `seed-005`, `seed-012`, and `seed-017` remain SR
  CONTRADICTED: respectively technology replaces the mechanism, an unretracted
  denial conflicts with the positive claim, and coincidence replaces causation.

The four keyword-stuffing cases and theory-name-only cases remain META, not EMPTY;
only the prompt definition needed hardening. Existing unresolved incompatible-claim
labels remain CONFLICTING_CLAIMS, while the self-correction and rejected-claim groups
remain NONE because one side is explicitly withdrawn.

## Operational diagnostics and prompt scope

Schema failures use one redacted category:
`STRUCTURED_OUTPUT_INVALID`, `NODE_SET_INVALID`, `STATUS_EVIDENCE_INVALID`,
`EVIDENCE_NOT_LITERAL`, or `EVIDENCE_NOT_UNIQUE`. The category may be stored in
internal `ai_runs` and aggregated by the evaluator; raw provider bodies, answers,
literal evidence, and prompts remain forbidden. External runtime failure remains
`JUDGE_UNAVAILABLE`.

The v3 system prompt contains only universal classification, evidence, context, and
policy-authority rules. Conway thresholds live in JUDGE_RUBRIC, avoiding v2's
cross-layer repetition. Deterministic tests require v3 to be at least 15% shorter
than v2 by UTF-8 byte count. Frozen v2 is 2,660 bytes and v3 is 1,743 bytes: 917
bytes, or 34.5%, smaller. This is a prompt-size result only, not a latency claim.

## Freeze hashes

The exact constants below are pinned in deterministic tests. The inherited-corpus
identity hashes the v1 seed bytes followed by the v1 messy-corpus bytes.

| Historical identity | SHA-256 |
| --- | --- |
| judge-v1 prompt | `37981f9cd17d4e7a72c54c9d7269548e8eb2928175d5a3e9448ecfbe52614aaa` |
| Conway v1 content | `079a65287f648c7b892eff4c8bd167d7a5ad58742c8bc3ff7a2639c3f8316182` |
| v1 manifest | `ba6d3bd5e6d5af8032edb06c3f27d69047a44ddfc5a1fc304427c24bbb19601c` |
| v1 seed corpus | `11ca416fd1dda17819c3d096a1e85ad42fbf9ddcbe02052c3d37b5c6f15fcb7c` |
| v1 messy corpus | `a103843d7ebb9899cbfe35bc13ff764ac816307dbdaf6976a34922ea690b7ecf` |
| judge-v2 prompt | `71bf51a99a52301ea0fed0c7ab47c74e47651d0a9f19295ce1193ff1b5c821b7` |
| Conway v2 content | `b1f362e237c12c5903f2ffb5d566455e0d4f40419f95a43b026eccb768554264` |
| v2 manifest | `e214b6f2fa0e1f8dd40a4853c62ae6bfb153364f829871d636ab26bf0a2d3b7c` |
| v2 override ledger | `221f90f94c0c07315352780df33664c93d046c65f6c4a0c7411174dbede94e53` |
| inherited v1 surface corpus | `6209aff4369b86374ab36708db4b2a502df736624113f087b06c96082e70890b` |
