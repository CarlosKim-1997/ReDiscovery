# Judge v2 label audit

`judge-dev-v2` reuses all 124 frozen v1 case texts and applies only the audited
label changes below. The executable source is
`eval/judge/v2/label-overrides.json`; every entry verifies its stated v1 `from`
value before applying `to`, so drift in the historical dataset fails loading.

Notation: `TB` = TEAM_BOUNDARIES, `CF` = COMMUNICATION_FRICTION, `DC` =
DECISION_CLUSTERING, `SR` = SYSTEM_RESEMBLANCE, `D` = DISCOVERED, `P` = PARTIAL,
`A` = ABSENT. Unlisted fields retain their exact v1 labels.

| Case IDs | V1 → V2 label changes | Semantic-contract reason |
| --- | --- | --- |
| `seed-002` | TB P→D | The current sentence explicitly forms a communication-defined actor group and uses it as the decision boundary. |
| `seed-003` | ambiguity TOO_SHORT→NONE; CF P→A | Team separation is clear despite brevity; communication is absent. Incompleteness is not ambiguity. |
| `seed-011`, `messy-unclear-reference-01` | SR P→A | Unresolved pronouns provide neither identifiable structures nor a usable structural proposition. |
| `seed-015`, `messy-theory-name-only-01..04` | AnswerType REASONING→META; ambiguity SEMANTIC_BOUNDARY→NONE | A theory name is a clear answer-label act with no causal reasoning. |
| `seed-016`, `messy-keyword-stuffing-01..04` | ambiguity SEMANTIC_BOUNDARY→NONE | The input is clearly META and proposition-free, rather than semantically borderline. |
| `seed-019` | SR P→A | Its only system phrase is a rejected quotation; the endorsed clause contains no system correspondence. |
| `messy-spacing-full-04` | SR D→A | The answer ends at team-partitioned design and never states an output/system relationship. |
| `messy-double-negation-02` | TB P→D; CF P→A | Team boundary is explicit; communication is absent. Double negation stays in Ambiguity. |
| `messy-double-negation-03` | TB P→A; DC A→P | No organizational grouping appears; “설계” is relevant but lacks local decision clustering. |
| `messy-double-negation-04` | CF P→A | Organization and output appear, but communication does not. |
| `messy-hedging-01` | TB P→D; CF P→D; DC P→D | The first three relationships are complete despite hedging; generic product relatedness keeps SR partial. |
| `messy-hedging-02..04` | TB P→D; CF P→D; DC P→D; SR P→D | Each current answer states the full chain. Uncertainty remains SEMANTIC_BOUNDARY rather than weakening nodes. |
| `messy-rejected-quote-01`, `-03` | TB P→D; DC P→D | The endorsed clause after the rejected quote explicitly states group boundaries and clustered decisions. |
| `messy-rejected-quote-02` | TB P→D; DC P→D; SR D→P | Cross-team grouping and local judgment are explicit; product “influence” lacks structural correspondence. |
| `messy-rejected-quote-04` | TB P→D; SR D→P | Team separation is explicit; the endorsed output claim states generic relatedness only. |
| `messy-correct-then-contradict-02` | TB D→P | A communication boundary is present without an organizational/team grouping proposition. |
| `messy-correct-then-contradict-03` | CF D→A | The current answer has no communication proposition. |
| `messy-correct-then-contradict-04` | TB D→A; CF D→P; DC D→A | Communication cost is merely mentioned; no team grouping or decision clustering appears. The final denial keeps SR contradicted. |
| `messy-communication-only-01`, `-04` | TB P→D | Each explicitly divides actors into communication-defined groups and compares communication across them. |
| `messy-decision-only-01..04` | TB P→D | Each explicitly defines an actor group/boundary and locates decisions inside it. |
| `messy-decision-only-04` | CF D→P | Collaboration is mentioned without a difference in communication access, frequency, cost, or ease. |
| `messy-resemblance-only-02`, `-03` | TB P→D | Team boundaries or company division are explicit sides of the structural comparison. |
| `messy-wrong-causal-vocabulary-02` | TB P→D | Organizational boundary is explicitly present even though the causal direction remains contradicted. |
| `messy-wrong-causal-vocabulary-03` | TB P→D; CF P→A; DC A→P | Team division and design are present, communication is absent, and design clustering is incomplete/reversed. |
| `messy-prior-state-01`, `-03` | TB P→D; CF P→A | Current text states grouping, decisions, and output structure; communication exists only in prior context and cannot be imported. |
| `messy-prior-state-02` | TB P→D | Current text itself partitions judgments and modules by team. |
| `messy-prior-state-04` | TB P→D; CF P→D | Current text explicitly defines communication-capable groups; no prior-state upgrade is needed. |
| `messy-mixed-minor-error-02` | CF D→A; DC D→P | Communication is absent; decision is related to a boundary without explicit local clustering. |
| `messy-mixed-minor-error-04` | TB D→A; CF D→P; DC D→A | It states system/communication-structure resemblance but no organizational grouping, communication contrast, or decision proposition. |

## Explicitly reviewed without relabeling

- Whole groups left unchanged after review: `typo-full`, `unicode-full`,
  `verbose-full`, `negation`, `asking`, `self-correction`,
  `sophisticated-offtopic`, `partial-overlap`, `team-only`, `meta`, `empty`, and
  `colloquial`.
- Individual variants left unchanged after review: `messy-spacing-full-01..03`,
  `messy-double-negation-01`, `messy-unclear-reference-02..04`,
  `messy-correct-then-contradict-01`, `messy-communication-only-02..03`,
  `messy-resemblance-only-01`, `-04`, `messy-wrong-causal-vocabulary-01`, `-04`,
  and `messy-mixed-minor-error-01`, `-03`.
- Seed cases left unchanged after review: `seed-001`, `seed-004..010`,
  `seed-012..014`, `seed-017..018`, and `seed-020`.
- `negation` remains CONTRADICTED because the user endorses the denial.
- `rejected-quote` and `self-correction` remain non-contradictory; only currently
  endorsed clauses supply evidence.
- `correct-then-contradict` remains CONFLICTING_CLAIMS with SR CONTRADICTED because
  the final denial is still endorsed.
- `wrong-causal-vocabulary` keeps SR CONTRADICTED because it endorses the reverse
  direction rather than merely mentioning causal vocabulary.
- `prior-state` labels use only propositions and evidence present in the current
  answer; structured history does not fill missing current nodes.
- `unclear-reference` retains UNCLEAR_REFERENCE where pronouns prevent resolving
  the proposition.
- `double-negation` and `hedging` retain SEMANTIC_BOUNDARY as the independent
  ambiguity dimension.

No label was changed because of the Luna baseline prediction. Every change follows
the v2 semantic contract. This is a development calibration set, not a holdout.
