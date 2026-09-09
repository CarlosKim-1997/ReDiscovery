# 0004 — Versioned v3 calibration, recursive suites, and redacted failures

Status: implemented and evaluated as an M3 development candidate; not promoted to production

## Decision

Create `judge-v3`, Conway content v3, and `judge-dev-v3` without changing any v1
or v2 identity. Runtime prompt selection continues to default to `judge-v1`, and
the Daily schedule continues to reference Conway v1.

Keep universal status, AnswerType, Ambiguity, current-answer, evidence, and policy
authority rules in the system prompt. Keep Conway-specific node thresholds in
JUDGE_RUBRIC. Require the v3 prompt to be at least 15% smaller than frozen v2 by
UTF-8 byte count; do not infer latency improvement without a live run.

Resolve evaluation inheritance recursively so v3 applies its audited delta to v2,
which applies its audited delta to the frozen v1 surface corpus. Every suite path is
confined beneath `eval/judge`, cycles are rejected, each declared expected case
count is checked, and every override verifies its immediate inherited `from` value.

Classify schema/evidence failures as structured-output, node-set, status/evidence,
non-literal evidence, or non-unique evidence. Store only that enum in internal
operational metadata and aggregate it in redacted evaluation reports. The public
runtime error remains `JUDGE_UNAVAILABLE`; raw answers, literal evidence, prompts,
and provider bodies are not retained.

## Semantic consequences

Communication-defined actor groups count as boundaries and can semantically entail
the communication difference. Decision clustering requires actual local design or
decision partitioning, not merely building together. SYSTEM_RESEMBLANCE requires
the output side to be downstream of or reflect the organizational/communication
side; bare similarity is partial and an endorsed reverse causal replacement is
contradicted.

## Deferred

A blind/final holdout, production prompt/content promotion, model selection, and
every M4-or-later capability remain outside this change.

## Recorded outcome

After the implementation was frozen at
`0b5bb72c8f9c012deabe88eac5be0e400b77ebf1`, explicit local Luna and Terra
development runs evaluated the same `judge-v3` / `judge-dev-v3` / Conway v3
identity. Their immutable evidence is recorded in
[`judge-v3-luna-baseline.md`](../evals/judge-v3-luna-baseline.md) and
[`judge-v3-terra-comparison.md`](../evals/judge-v3-terra-comparison.md). Hosted
credential-free deterministic checks for that commit passed in
[`run 34250400708`](https://github.com/CarlosKim-1997/ReDiscovery/actions/runs/34250400708).
