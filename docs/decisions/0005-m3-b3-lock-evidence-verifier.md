# 0005 — Independent lock evidence verification

Status: implemented as an M3 development evaluation gate

## Decision

Add an independent `LockVerifierPort` whose only semantic vocabulary is
`VERIFIED` and `INSUFFICIENT`. Its input contains required node IDs and rubric
descriptions plus submitted answer IDs and text. It receives no primary Judge
verdict, guidance, hidden policy, Reveal content, theory/person/year identity, or
lockability state. Its output covers every required node exactly once and may cite
one unique literal fragment from one submitted answer only when support is
`VERIFIED`.

The application layer validates exact node coverage, answer references, status and
evidence shape, literal occurrence, and uniqueness, then converts evidence into
answer-relative UTF-16 spans. Only the deterministic evaluator may derive approval:
every required node must be verified. Neither the port nor the model emits or
decides `Lock` or `No Lock`.

The provider adapter uses immutable `lock-verify-v1`, structured output,
`store: false`, no tools, no SDK retries or logging, and at most one application
retry for redacted structural/evidence failure categories. It is deliberately not
wired into gameplay, the composition root, persistence, migrations, or Daily.

## Evaluation evidence

`lock-verifier-dev-v1` contains 124 single-answer cases mechanically derived from
the frozen `judge-dev-v3` labels and 16 reviewed multi-answer fixtures. For each
required node, a frozen `DISCOVERED` label maps to `VERIFIED`; every other status
maps to `INSUFFICIENT`. This corpus is development calibration material, not a
holdout.

| Verifier identity | SHA-256 |
| --- | --- |
| lock-verify-v1 prompt | `bd6dc56f74c39016c61048fc4f437a63bdb6d15a9ad5bc59ac782e62f4e7607f` |
| verifier manifest | `5a7905877ec9d27cabdd7eaf90a04d51286e0c7414aba32eb74e02fdcf3350d3` |
| reviewed multi-answer fixtures | `d4016b1b7e0f8ca06fb81eb3e44b3fc981ce0335ff288ea541cbf3e9c1c8e45a` |

The evaluator reports per-node support metrics, deterministic approval metrics,
false approvals/rejections, retries, failures, latency, token/cost totals, and only
redacted failure IDs/categories. It refuses reports containing raw answers,
evidence, prompts, or provider payloads.

## Operations and deferred work

`pnpm eval:lock-verifier` requires explicit local `OPENAI_API_KEY` and
`ADJUDICATION_MODEL`. The first future run is Luna. Terra is not run unless Luna
fails the stated acceptance gate. The command never runs in normal CI and failure
does not modify gameplay or unlock a fallback path.

The intended later no-fail behavior is documented but not implemented: a semantic
self-discovery Lock candidate would require verification; rejection would continue
guidance; max-turn Rescue would remain a separate path and Rescue-assisted Lock
would not be blocked. Rejection would never rewrite or delete historical Judge
evidence.

Live verifier execution, model selection, production wiring, a final holdout,
adjudication/dispute flow, and every M4 feature remain deferred.
