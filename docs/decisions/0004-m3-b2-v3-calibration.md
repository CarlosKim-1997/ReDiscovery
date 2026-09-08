# 0004 — Versioned v3 calibration, recursive suites, and redacted failures

Status: implemented as an M3 development candidate

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

V3 provider evaluation, a blind/final holdout, production prompt/content promotion,
model selection, and every M4-or-later capability remain outside this change.
