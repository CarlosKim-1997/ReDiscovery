# Lock Verifier v1 Terra development comparison

**Result: FAIL.** This is immutable, redacted historical development evidence; it
is not Final Holdout evidence and cannot close M3.

## Frozen identity

- artifact: `lock-verifier-dev-v1-1788954679196.json`
- artifact SHA-256: `01b247b767b3f25b76b826c6fafd810315684688dfc3a28a47c965eae9b2e7ad`
- git: `a60fb3a84629fe9b1a30ae0d50f555e545755f96`
- model: `gpt-5.6-terra`
- dataset/prompt/content: `lock-verifier-dev-v1` / `lock-verify-v1` /
  `conway-law` v3
- content hash: `aa895e12261a257c6e0654e9a5ef5d876258bf294b9c984f803df0be17a5a042`
- cases: 140; semantically evaluated: 139; unavailable: 1

## Results

- approval TP/FP/FN/TN: 41 / 2 / 6 / 90
- approval precision/recall: 0.9535 / 0.8723
- false approvals: `messy-prior-state-02`, `messy-rejected-quote-04`
- overall VERIFIED precision/recall/F1: 0.9340 / 0.9154 / 0.9246
- required-node VERIFIED precision: TEAM_BOUNDARIES 0.9231,
  COMMUNICATION_FRICTION 0.9538, SYSTEM_RESEMBLANCE 0.9259
- unavailable: `messy-spacing-full-04`, unrecovered `EVIDENCE_NOT_LITERAL`
- retries: 2 cases / 2 attempts; retry-case rate 0.0143; provider failures 0
- latency p50/p95/max: 3854 / 7708 / 11331 ms
- tokens input/output/total: 83096 / 33192 / 116288; cost unavailable
- raw answer, literal evidence, prompt, and provider-payload leakage: 0

The two false approvals are the same as Luna v1. The gate also fails overall and
per-node precision, regression exact-match, 140/140 validity, and zero-unrecovered-
failure requirements. No failing metric is offset by another metric. The tracked
record contains no raw answers or provider payloads; the gitignored artifact is
retained unchanged.
