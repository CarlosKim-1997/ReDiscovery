# Lock Verifier Final Holdout Protocol

Status: frozen before holdout creation or live execution

This protocol governs the final M3 evaluation of a frozen Lock Evidence Verifier
candidate. It is subordinate to the Master Packet identified in
[`docs/spec-authority.md`](../spec-authority.md). The exact dataset composition is
owned by the companion
[composition contract](lock-verifier-final-holdout-composition-contract.md), and
M3 closure is owned by [decision 0006](../decisions/0006-m3-final-holdout-and-closure.md).

No holdout case text or sealed holdout artifact existed when this protocol was
frozen. `lock-verifier-dev-v1` is development calibration material and is not a
final holdout.

## Question under test

The Final Holdout is not a new measurement of the primary Judge's overall
performance. It answers one safety question:

> On previously unseen, realistic user expressions, does the Lock Evidence
> Verifier avoid approving semantic self-discovery that the user did not make?

A false rejection can be recovered through further thought or Guidance. A false
approval falsely declares a rediscovery and directly damages the core product
trust. The evaluation therefore favors conservative Lock safety. One false
approval is a hard failure and cannot be offset by any other metric.

## Independent creation and review

The holdout must be authored in a later, separate session or process. Its authors
should receive only the human-readable required-node definitions, the human
labeling rule for `VERIFIED` and `INSUFFICIENT`, and realistic gameplay context.
Where practicable, authors and reviewers must not receive:

- the full verifier prompt;
- development failure patterns or provider outputs; or
- any existing development case text.

The following creation methods are prohibited:

- mechanically transforming a `judge-dev-v3` case;
- paraphrasing a `lock-verifier-dev-v1` case;
- changing only words or surface details in an existing case;
- tailoring cases after viewing Luna or Terra development failures; or
- reverse-engineering cases against the wording of `lock-verify-v1`.

Before sealing, a human audit must confirm that no holdout sentence or expression
substantially duplicates the current development corpus. Cases must read like
natural user interaction; coverage tags must not force one isolated phenomenon
per case.

## Labeling and review procedure

Each case has an expected `VERIFIED` or `INSUFFICIENT` label for every required
node. Expected approval is derived, never independently invented: it is positive
only when all required nodes are labeled `VERIFIED`; otherwise it is negative.

1. An author creates the case without access to the verifier prompt, development
   failures, provider output, or existing case text wherever practicable.
2. A human labeler applies the required-node definitions and records a rationale
   for every node label.
3. A second human reviewer independently checks the case, labels, approval
   derivation, realism, and development-corpus independence.
4. Disagreements are resolved from the human-readable semantic definitions, not
   by querying a provider or consulting `lock-verify-v1` wording.
5. The finalized artifact is schema-validated, manually audited for substantive
   overlap, hashed, and sealed. The metadata record is completed before any
   candidate sees case text.

The creation and review record must identify the procedure and completion state,
but public metadata must not expose raw answers or case text.

## Candidate freeze and eligibility

A candidate becomes eligible only after it passes its development live gate. The
following identity is then frozen before the holdout is unsealed:

- provider model and immutable provider model identifier;
- prompt version and prompt bytes;
- content slug/version and required-node descriptions;
- evaluator version and source Git SHA;
- required-node semantics;
- schema and application validation logic; and
- retry policy.

No semantic behavior may change between freeze and Final Holdout execution. Any
change to a frozen item creates a new candidate identity and removes the old
candidate's eligibility for an unconsumed holdout.

Credential, network, output-directory, disk-space, manifest, hash, and candidate
identity preflights must complete before plaintext case text is exposed to the
candidate runner. Preflight must not invoke the provider.

## Sealed storage and repository boundary

The case text is stored as a sealed local artifact outside public Git. It must not
be committed, copied into documentation, test fixtures, logs, evaluation reports,
or ordinary development context. The repository records metadata only:

- dataset identity and schema version;
- case and label composition;
- semantic coverage contract;
- creation date;
- SHA-256 of the exact sealed artifact bytes;
- labeling and review procedure and completion; and
- the acceptance contract in this protocol.

Repository tooling for sealed-artifact handling is not required by this protocol
freeze and is not part of this change. When the artifact is later created, its
storage location and access controls must be recorded outside public Git.

## Single-use consumption rule

One sealed holdout version may evaluate one frozen candidate exactly once. The
holdout is consumed when any of its plaintext case text is first exposed to that
candidate or its evaluation process. An abort after exposure counts as consumption;
application retries permitted inside that one run do not create a second run.

After results are exposed, the same holdout cannot be used for final acceptance of
a modified prompt, model, label logic, validation rule, retry policy, evaluator, or
required-node semantics. A failed candidate returns to development calibration.
The next candidate requires a new freeze and a newly authored, independently
sealed holdout version. Repeatedly tuning against and rerunning one holdout is
prohibited.

## Hard acceptance gates

All gates apply to the one frozen-candidate run and all must pass:

1. False approval count equals `0`.
2. Approval precision equals `1.0000`.
3. Approval recall is at least `0.8500`.
4. Overall node-level `VERIFIED` precision is at least `0.9500`.
5. Node-level `VERIFIED` precision is at least `0.9500` for every required node.
6. All 120 cases pass holdout schema validation and application evidence
   validation.
7. Unrecovered verification failure count equals `0`.
8. Raw answer, prompt, or provider-payload leakage count equals `0` outside the
   sealed artifact and the transient provider request boundary.
9. Retry rate is at most `5%`, defined as cases requiring the one permitted
   application retry divided by 120 (at most 6 retried cases).

Approval precision is `TP / (TP + FP)` over case-level approval. Approval recall is
`TP / (TP + FN)` over the 40 expected-positive cases. Overall `VERIFIED` precision
pools all required-node predictions; per-node precision is computed separately.
Undefined precision fails its gate. A verification failure is unrecovered when no
schema- and application-valid verdict exists after the frozen retry policy.

Latency percentiles, token use, and cost must be recorded in the redacted result,
but they are not semantic hard-fail thresholds for this holdout. They require a
separate operational decision before production integration.

## Evidence record

The immutable result record must bind the candidate freeze, holdout metadata and
SHA-256, evaluator Git SHA, start/completion time, all gate numerators and
denominators, operational measurements, redacted failure identifiers/categories,
and the SHA-256 of the redacted result artifact. It must contain no raw answer,
literal evidence, full prompt, or provider payload. A PASS may be recorded only
when every hard gate above is demonstrably true.
