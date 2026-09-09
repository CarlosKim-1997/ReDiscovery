# Judge v3 Terra development comparison

This is the immutable historical record of the frozen Terra comparison run
supplied for M3-B3. It used the same repository, prompt, dataset, content, and
124-case identities as the Luna v3 baseline at
`0b5bb72c8f9c012deabe88eac5be0e400b77ebf1`. It is comparison evidence, not a
production model selection.

- Source artifact: `judge-dev-v3-1788886305589.json` (gitignored, redacted)
- Source artifact SHA-256: `6c6a66f0b2b4d8c123fbced5a7f53d37bafd5c87fa533cdcf46c53496a75cff0`

| Metric | Result |
| --- | ---: |
| Provider model | `gpt-5.6-terra` |
| Node macro F1 | 0.8926 |
| DISCOVERED precision / recall / F1 | 0.9526 / 0.9526 / 0.9526 |
| PARTIAL F1 | 0.6517 |
| ABSENT F1 | 0.9661 |
| CONTRADICTED F1 | 1.0000 |
| Core DISCOVERED precision | 0.9451 |
| Core DISCOVERED recall | 0.9509 |
| Premature-lock proxy | **2** |
| Premature-unlock proxy | **3** |
| AnswerType accuracy | 0.9919 |
| Ambiguity accuracy | 0.7742 |
| Schema-valid rate | 0.9919 |
| Retries / provider failures | 1 / 0 |
| Latency p50 / p95 | 3,755 ms / 6,245 ms |
| Total tokens | 140,536 |
| Estimated cost | not computed for the comparison model |

The two premature-lock cases were `messy-rejected-quote-02` and
`messy-rejected-quote-04`. The shared Luna/Terra failure on
`messy-rejected-quote-04`, plus the model-specific failures on
`messy-spacing-full-04` and `messy-rejected-quote-02`, are explicit lock-verifier
regression spot checks. The frozen identity hashes are listed in the
[Luna v3 baseline](judge-v3-luna-baseline.md).

These measurements were read directly from the source artifact identified above;
no metric was reconstructed from memory.
