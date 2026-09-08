# Judge v1 Luna baseline

This is the immutable historical record of the first untouched real-provider run
against the reviewed M3-A implementation. Later prompt, rubric, dataset, or model
results must not replace or reinterpret this baseline.

## Identities

- Git SHA: `e9f95f0124b1c6413b4dd1a6a02258c7c0daef20`
- Provider model: `gpt-5.6-luna`
- Prompt: `judge-v1`
- Dataset: `judge-gold-v1`
- Content: `conway-law` version 1
- Cases: 124
- Run character: first untouched real-provider evaluation
- Generated local artifact: intentionally gitignored

The frozen source hashes are:

| Source | SHA-256 |
| --- | --- |
| `eval/judge/v1/conway.seed.jsonl` | `11ca416fd1dda17819c3d096a1e85ad42fbf9ddcbe02052c3d37b5c6f15fcb7c` |
| `eval/judge/v1/conway.messy.json` | `a103843d7ebb9899cbfe35bc13ff764ac816307dbdaf6976a34922ea690b7ecf` |
| `eval/judge/v1/manifest.json` | `ba6d3bd5e6d5af8032edb06c3f27d69047a44ddfc5a1fc304427c24bbb19601c` |
| `content/approved/conway-law.v1.json` | `079a65287f648c7b892eff4c8bd167d7a5ad58742c8bc3ff7a2639c3f8316182` |

The runtime `judge-v1` prompt string is pinned in deterministic tests at SHA-256
`37981f9cd17d4e7a72c54c9d7269548e8eb2928175d5a3e9448ecfbe52614aaa`.

## Results

| Metric | Result |
| --- | ---: |
| Node macro F1 | 0.5746 |
| DISCOVERED precision | 0.7922 |
| DISCOVERED recall | 0.6421 |
| PARTIAL F1 | 0.1739 |
| CONTRADICTED F1 | 0.5714 |
| Core DISCOVERED precision | 0.7731 |
| Core DISCOVERED recall | 0.6389 |
| Premature-lock proxy | **0** |
| Premature-unlock proxy | **18** |
| AnswerType accuracy | 0.9032 |
| Ambiguity accuracy | 0.7984 |
| Schema-valid rate | 0.9919 |
| Provider failures | 0 |
| Retry rate | 0.0242 |
| Latency p50 | 4,125 ms |
| Latency p95 | 8,557 ms |
| Tokens | 103,087 |
| Estimated total cost | $0.0560284 |

This run had zero premature-lock proxies and 18 premature-unlock proxies. It is
evidence about the frozen v1 combination only. V2 development results belong to a
new record and cannot overwrite this one.
