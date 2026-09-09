# Judge v3 Terra development comparison

This is the immutable historical record of the frozen Terra comparison run
supplied for M3-B3. It used the same repository, prompt, dataset, content, and
124-case identities as the Luna v3 baseline at
`0b5bb72c8f9c012deabe88eac5be0e400b77ebf1`. It is comparison evidence, not a
production model selection.

| Metric | Result |
| --- | ---: |
| Provider model | `gpt-5.6-terra` |
| Node macro F1 | 0.8926 |
| Core DISCOVERED precision | 0.9451 |
| Core DISCOVERED recall | 0.9509 |
| Premature-lock proxy | **2** |
| Premature-unlock proxy | **3** |

The two premature-lock cases were `messy-rejected-quote-02` and
`messy-rejected-quote-04`. The shared Luna/Terra failure on
`messy-rejected-quote-04`, plus the model-specific failures on
`messy-spacing-full-04` and `messy-rejected-quote-02`, are explicit lock-verifier
regression spot checks. The frozen identity hashes are listed in the
[Luna v3 baseline](judge-v3-luna-baseline.md).

