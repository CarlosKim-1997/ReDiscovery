# Architecture through M3

```text
Next.js route (src/app)
  ├─ application use case (framework-independent)
  │    └─ port contract
  └─ server composition root
       ├─ validated server-only config
       └─ concrete adapter implementing a port
```

`GET /api/health` demonstrates this path with `getHealth(ClockPort)` and
`SystemClock`. It performs no external I/O. Its response is explicitly uncached.
The home page is a static, temporary preparation screen, not a game prototype.

## Dependency boundary

| Layer | Allowed local dependencies |
| --- | --- |
| `domain` | domain, shared |
| `ports` | ports, domain, shared |
| `application` | application, domain, ports, shared |
| `shared` | shared |
| `adapters` | adapters, domain, ports, shared |
| `config` | config |
| `server` | server, adapters, application, ports, config, shared |
| `app` | app, application, ports, server, shared |

Core layers may use Zod as a vendor-neutral validation library. All other external
runtime dependencies are rejected there. Vendor SDKs (Supabase, OpenAI, Upstash,
Cloudflare, Sentry) may only be imported in `adapters`. No such SDK is needed in M0.
`server/container.ts` is the composition root, and is marked `server-only`.
Future vendor credentials are injected there, never read by domain/application.

`tooling/eslint/architecture.mjs` checks alias and relative imports, re-exports,
type imports, literal dynamic imports, and require calls. Computed module paths
are rejected. `shared` cannot act as an SDK bridge. Tests exercise allowed and
forbidden edges so the guard itself is verified. These are static development
guards, not a security sandbox. Future four-layer payload isolation needs its own
DTO, persistence, and HTTP tests in the corresponding milestones.

## Time and configuration

`ClockPort.now()` returns a `Date`. Only the system adapter reads the current
wall clock. Unit tests inject fixed instants. Domain/application/ports/shared
cannot refer to ambient `Date`, `process`, or `fetch` under lint rules.
Canonical Daily resolution matches both the `ClockPort` instant's Asia/Seoul date
and a released schedule row. An unscheduled date has no current Daily.

`config/schema.ts` parses only owned environment keys, freezes output, and reports
invalid key names without raw values. `next.config.ts` validates at configuration
load for dev/build/start; `config/server.ts` prevents client import and validates
at server composition. No secrets or config object enter HTTP responses.

## Milestone scope

M0 includes the Master Packet §9 vocabulary in `domain/play/vocabulary.ts`
(AttemptType, PlayStatus, PlayStage, NodeStatus, AnswerType, Ambiguity) and
`domain/reveal/vocabulary.ts` (ComparisonStatus). Frozen `as const` string tuples
provide runtime values; indexed-access type aliases provide exact literal unions.
They compare and serialize as the canonical strings, without framework/vendor
dependencies, numeric enums, database mappings, or state transition behavior.
Contract tests pin all seven serialized vocabularies and their exact union types.

M1 adds the first consumers for `JudgePort` and `PrimaryStorePort`. The server
composition root selects `FakeJudgeAdapter` and `InMemoryPrimaryStore`.
Route handlers call explicit application use cases; domain policy alone determines
Guidance, LOCKABLE, Lock, and Reveal completion transitions. UI code only renders
the returned public session projection.

The public projection contains submitted thoughts, delivered guidance, lifecycle
status, and representative text. It excludes node verdicts and all Reveal history.
The Reveal fixture lives in a server-only module and is returned by a dedicated API
only for LOCKED/REVEALED sessions. Pre-Lock browser/API contract tests scan for the
historical identity strings.

M2 replaces the M1 in-memory/replay bridge with `PostgresPrimaryStore`. SQL and the
`postgres.js` import live only in `src/adapters`; routes obtain an anonymous device
through a server-only cryptographic identity adapter and call the canonical Daily
application use cases. The browser stores no submitted answers or session snapshot.

Approved content is validated into PUBLIC_PLAY, JUDGE_RUBRIC, SERVER_POLICY, and
REVEAL_CONTENT. Only PUBLIC_PLAY crosses the pre-Lock boundary. Generic domain
policy consumes dynamic node IDs and SERVER_POLICY; FakeJudge consumes JUDGE_RUBRIC.

Content definitions and editorial schedules are separate repository inputs. Content
hashes exclude scheduling, and composite PostgreSQL constraints bind session evidence,
completion Daily, and immutable session Daily/content identity.

Comparison/Auth/Redis/Turnstile/Telemetry ports will be defined when their actual
use cases start. M3 adds no experiment, PWA service worker, account auth, or deployment.

M3 keeps `JudgePort` provider-neutral and adds `OpenAIJudgeAdapter` plus a mocked
transport seam under `src/adapters/openai-judge`. The adapter is the only layer that
imports the OpenAI SDK. It returns an untrusted structured verdict and redacted
attempt metadata; application code checks exact node coverage and converts unique
literal evidence text into canonical answer spans before deterministic policy runs.

Answer submission is now a three-transaction sequence: reserve the raw answer and
`EVALUATING`, call the provider with no transaction open, then persist the validated
policy result. A failed evaluation atomically removes the unclassified answer and
restores the prior gameplay state while incrementing `state_version`. `ai_runs`
retains only non-raw operational metadata; its answer foreign key becomes null if
the reservation is rolled back.

M3-B1 adds a provider-independent immutable prompt catalog under `src/shared`.
The OpenAI adapter constructor defaults to the accepted `judge-v1`, which is
therefore still used by the runtime composition root. Evaluation may explicitly
select `judge-v2`; the chosen prompt version is carried into each transport request
and attempt record. The evaluator
loads dataset, content, and expected prompt identities from a versioned manifest
and rejects mismatches before any provider call.

`eval/judge/v2` is a development-suite delta over the frozen 124 v1 texts. Its
manifest names `judge-dev-v2`, content version 2, and `judge-v2`; its override
ledger verifies every old label before applying an audited semantic change.
`conway-law.v2.json` copies PUBLIC_PLAY, SERVER_POLICY, and REVEAL_CONTENT unchanged
and sharpens only JUDGE_RUBRIC. Daily schedule entries remain on content version 1.

M3-B2 adds `judge-v3` and `conway-law.v3.json` as development-only candidates.
The v3 system prompt is limited to universal semantics while content-specific
thresholds live in JUDGE_RUBRIC. Evaluation suites resolve recursive, confined,
cycle-checked inheritance (`v3 → v2 → v1`) with stale override detection.
Redacted `ai_runs.failure_category` distinguishes structured-output, node-set,
status/evidence, non-literal, and non-unique evidence failures without retaining
raw answers, prompts, evidence, or provider bodies. Runtime composition and the
Daily schedule continue to select v1; deterministic policy still owns Lock.

M3-B3 adds a second, independent `LockVerifierPort` and an OpenAI adapter used only
by the offline development evaluator. The verifier receives required-node IDs and
rubric descriptions plus answer IDs/text; it receives no Judge result, guidance,
SERVER_POLICY, Reveal data, hidden identity, or gameplay state. Its provider-neutral
result says only `VERIFIED` or `INSUFFICIENT` per required node. Application
validation resolves unique literal citations to answer-relative spans, and a pure
evaluator helper approves only when every required node is verified.

The verifier is not registered in `server/container.ts`, called by Daily use cases,
or represented in persistence. `lock-verify-v1` and `lock-verifier-dev-v1` are
development identities. Live execution is an explicit local command using
`ADJUDICATION_MODEL`; normal CI and gameplay remain unaffected by its absence or
failure.

M3-B3 v2 adds a distinct factorized proof port without changing v1. Deterministic
application code creates exact UTF-16 evidence units from supplied answers and
derives binary support from provider-reported endorsement, reference resolution,
semantic-match class, and unit IDs. The provider schema contains no final support
or Lock field. Cross-answer resolution is admissible only with a distinct,
supplied-answer antecedent unit. OpenAI request construction remains isolated in
`src/adapters/openai-lock-verifier-v2`; the v2 port can be implemented by another
provider. Like v1, v2 is offline evaluator-only and has no runtime wiring.

M3-B3 v3 remains a separate evaluator-only path and keeps the canonical four
content layers. Approved content schema version 2 adds generic Lock proof
components under server-only `SERVER_POLICY.lock_verifier`; schema version 1
content remains unchanged. The provider returns component-local proof facts, and
provider-neutral application code validates exact component coverage and derives
node support only when every required component passes. Same-answer and
cross-answer antecedents use one canonical supplied-evidence order. Redacted
rejected-proof diagnostics retain only enum values and unit IDs. V3 is not wired
into runtime composition, persistence, Daily behavior, or public DTOs.
