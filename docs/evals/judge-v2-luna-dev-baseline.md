# Judge v2 Luna development baseline

This is the immutable historical record of the first live `judge-v2` development
run. It evaluates the exact repository state below and does not promote v2 to
production. The generated raw local evaluation artifact was not stored.

## Identities

- Git SHA: `00f1619b7f4ce5cd0b57591dcca5b0bd917795fc`
- Provider model: `gpt-5.6-luna`
- Prompt: `judge-v2`
- Dataset: `judge-dev-v2`
- Content: `conway-law` version 2
- Cases: 124
- Run character: first live `judge-v2` development run

The deterministic freeze tests pin these exact SHA-256 identities. The inherited
corpus identity hashes the v1 seed bytes followed by the v1 messy-corpus bytes.

| Historical identity | SHA-256 |
| --- | --- |
| judge-v2 prompt | `71bf51a99a52301ea0fed0c7ab47c74e47651d0a9f19295ce1193ff1b5c821b7` |
| Conway v2 content | `b1f362e237c12c5903f2ffb5d566455e0d4f40419f95a43b026eccb768554264` |
| v2 manifest | `e214b6f2fa0e1f8dd40a4853c62ae6bfb153364f829871d636ab26bf0a2d3b7c` |
| v2 override ledger | `221f90f94c0c07315352780df33664c93d046c65f6c4a0c7411174dbede94e53` |
| inherited v1 surface corpus | `6209aff4369b86374ab36708db4b2a502df736624113f087b06c96082e70890b` |

## Results

| Metric | Result |
| --- | ---: |
| Node macro F1 | 0.7507 |
| DISCOVERED precision | 0.9588 |
| DISCOVERED recall | 0.7837 |
| PARTIAL F1 | 0.4340 |
| CONTRADICTED F1 | 0.7500 |
| Core DISCOVERED precision | 0.9457 |
| Core DISCOVERED recall | 0.7625 |
| Premature-lock proxy | **0** |
| Premature-unlock proxy | **13** |
| AnswerType accuracy | 0.9435 |
| Ambiguity accuracy | 0.8548 |
| Schema-valid rate | 0.9758 |
| Retries | 5 |
| Provider failures | 0 |
| Latency p50 | 6,960 ms |
| Latency p95 | 14,808 ms |
| Total tokens | 159,751 |
| Estimated cost | $0.0722672 |

V2 preserved the primary safety signal of zero premature locks and reduced
premature unlocks from 18 to 13. Operationally it regressed versus v1: total tokens
rose from 103,087 to 159,751, p50 latency from 4,125 to 6,960 ms, and p95 latency
from 8,557 to 14,808 ms. These are historical live-run observations, not a
production latency claim.
