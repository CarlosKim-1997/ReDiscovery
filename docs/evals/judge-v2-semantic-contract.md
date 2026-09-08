# Judge v2 semantic contract

Judge v2 separates conceptual completeness from linguistic certainty. It classifies
only the current answer. Deterministic application policy owns historical merge,
guidance, Lock, Reveal, scoring, and all session transitions.

## NodeStatus

`DISCOVERED` means the current answer explicitly expresses the complete conceptual
relationship required by the node. Terminology and confidence are unnecessary.
Hedges such as “아마”, “가능성이 있다”, “같다”, and “확실하지 않지만” do not
downgrade a complete proposition. A complete hedged proposition can be DISCOVERED
with `SEMANTIC_BOUNDARY` ambiguity.

`PARTIAL` means structural incompleteness: relevant entities without the required
relationship, a suggested but unestablished causal link, generic relatedness, or
only one side of a comparison. User uncertainty alone never causes PARTIAL.

`ABSENT` means the current answer has no usable semantic evidence for the node.
Keywords, a theory/person name, and lists of relevant vocabulary are insufficient.

`CONTRADICTED` means the user currently endorses a proposition incompatible with
the node. Rejected quotations, abandoned earlier thoughts, explicit corrections,
and claims mentioned only to deny them are not contradictions. The final endorsed
meaning controls.

## Conway v2 node thresholds

- `TEAM_BOUNDARIES`: DISCOVERED requires meaningful organizational/team grouping
  or boundaries that divide actors and matter to the mechanism. Merely naming a
  team, organization, or groups is at most PARTIAL.
- `COMMUNICATION_FRICTION`: DISCOVERED requires a difference in communication
  access, frequency, cost, or ease across organizational boundaries, including
  easier/more frequent communication inside, harder/costlier communication across,
  or communication following group boundaries. A communication mention is PARTIAL.
- `DECISION_CLUSTERING`: DISCOVERED requires design/coordination decisions to
  cluster, partition, or become locally determined inside communication groups or
  boundaries. A design-decision mention is PARTIAL.
- `SYSTEM_RESEMBLANCE`: DISCOVERED requires actual structural correspondence: the
  product/system/output reflects, resembles, reproduces, or follows organizational
  or communication boundaries. Generic influence is PARTIAL. An endorsed denial of
  any such relationship is CONTRADICTED.

## Prior state

`priorConfirmedState` and `lastGuidance` may disambiguate limited context, but cannot
independently upgrade or downgrade a current node, create a node absent from the
current answer, or supply evidence. The LLM never performs historical merge.

## AnswerType

- `EMPTY`: no substantive answer.
- `ASKING_FOR_ANSWER`: primarily requests the answer, theory, or hint.
- `META`: discusses the game, theory naming, keyword matching, evaluation, or the
  act of answering without causal reasoning.
- `OFF_TOPIC`: substantive content unrelated to the presented problem.
- `REASONING`: attempts to explain the presented phenomenon.

Keyword stuffing and theory-name-only input are META, not REASONING. AnswerType
does not determine NodeStatus; each node still requires its proposition.

## Ambiguity

- `NONE`: meaning is sufficiently clear.
- `TOO_SHORT`: brevity itself prevents meaningful interpretation.
- `UNCLEAR_REFERENCE`: unresolved references prevent identifying the proposition.
- `CONFLICTING_CLAIMS`: incompatible claims remain simultaneously endorsed without
  clear resolution.
- `SEMANTIC_BOUNDARY`: the meaning is interpretable but near a classification
  boundary because of qualification, double negation, underspecification, or
  uncertainty.

The most specific cause wins. A short answer is not TOO_SHORT merely because of its
length, and a hedge does not erase a complete concept.

## Evidence

DISCOVERED, PARTIAL, and CONTRADICTED require a literal substring of the exact
current answer. The Judge selects the shortest sufficient unique substring and adds
context if a shorter candidate repeats. It never paraphrases or uses prior state or
guidance as evidence. ABSENT requires null evidence. Existing server validation
continues to reject missing, fabricated, repeated, or non-literal evidence.
