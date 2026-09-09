# Judge v3 Luna development baseline

This is the immutable historical record of the frozen Luna `judge-v3` development
run supplied for M3-B3. It evaluates the exact identity below. It does not promote
v3 to production, and the generated local report is not committed.

## Identities

- Git SHA: `0b5bb72c8f9c012deabe88eac5be0e400b77ebf1`
- Provider model: `gpt-5.6-luna`
- Prompt: `judge-v3`
- Dataset: `judge-dev-v3`
- Content: `conway-law` version 3
- Cases: 124
- Source artifact: `judge-dev-v3-1788885568608.json` (gitignored, redacted)
- Source artifact SHA-256: `258cf228e849a716526fa4c4e143060464d37eddc8f148980fdd5d4b1230f2f9`

| Historical identity | SHA-256 |
| --- | --- |
| judge-v3 prompt | `b53c1955a225e44a3fd2e40c98fbd07ab413d0e73d325fbaf49650899a3a927f` |
| Conway v3 content | `f0e17aa32ee429e0d37d55b29cc353d13514993aeda8f1854973c2f9d9434d9e` |
| v3 manifest | `9232f2aa2637c86b28cac0ddf319edbba6bd391881741ae6ed5fa66f0ddb23ab` |
| v3 override ledger | `ce2e0a4acfb95e00ffe5a5bd588e27b9dfaf026591dfae99dcf90d4b21bce2bb` |
| inherited v2 manifest | `e214b6f2fa0e1f8dd40a4853c62ae6bfb153364f829871d636ab26bf0a2d3b7c` |
| inherited v2 override ledger | `221f90f94c0c07315352780df33664c93d046c65f6c4a0c7411174dbede94e53` |
| inherited v1 surface corpus | `6209aff4369b86374ab36708db4b2a502df736624113f087b06c96082e70890b` |

## Results

| Metric | Result |
| --- | ---: |
| Node macro F1 | 0.8413 |
| DISCOVERED precision / recall / F1 | 0.9602 / 0.9190 / 0.9392 |
| PARTIAL F1 | 0.5243 |
| ABSENT F1 | 0.9339 |
| CONTRADICTED F1 | 0.9677 |
| Core DISCOVERED precision | 0.9487 |
| Core DISCOVERED recall | 0.9136 |
| Premature-lock proxy | **2** |
| Premature-unlock proxy | **6** |
| AnswerType accuracy | 0.9839 |
| Ambiguity accuracy | 0.8306 |
| Schema-valid rate | 0.9919 |
| Retries / provider failures | 2 / 0 |
| Latency p50 / p95 | 5,474 ms / 10,352 ms |
| Total tokens | 158,144 |
| Estimated cost | $0.0765018 |

The two premature-lock cases were `messy-spacing-full-04` and
`messy-rejected-quote-04`. These measurements were read directly from the source
artifact identified above; no metric was reconstructed from memory.
