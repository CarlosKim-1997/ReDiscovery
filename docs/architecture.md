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

The first v3 Luna development run failed its frozen acceptance contract and
reached the architecture stop-rule. M3 therefore begins the provider-free
foundation for the **Final Synthesis Gate** without accepting or modifying v3.
Approved content schema version 3 extends schema v2 only with a generic,
server-only `SERVER_POLICY.final_synthesis` policy. Development-only
`conway-law` v5 is unscheduled and otherwise preserves v4.

The new `FinalSynthesisVerifierPort` accepts only required node/component
descriptions, one user-authored synthesis, and exact synthesis-local evidence
units. Provider-neutral application code validates `final-synthesis-proof-v1`
and derives support without any prior answers, Judge state, Guidance, Reveal
data, expected labels, or historical identity. This foundation has no provider
prompt or model identity.

The provider-free Final Synthesis runtime core adds only persistent
`SYNTHESIZING` and `REVEAL_READY` phases. A dedicated synthesis-attempt table owns
submission count, evaluation state, leases, generation fencing, purgeable text,
and redacted proof. The application orchestrates reservation, an out-of-transaction
port call, and atomic completion/recovery. Legacy `lock_answer_id` remains valid;
verified synthesis uses a separate same-session evidence reference, and
`locked_at` is present only for actual verified evidence.

The Final Synthesis product wiring exposes three server-owned commands: submit a
new synthesis, retry the same recoverable evaluation generation, and skip to
unverified Reveal. A client-safe projection contains only product limits and
capabilities; proof components, provider metadata, and hidden content remain
server-only. A deterministic exact-fixture verifier is composed only in
`APP_ENV=test`; all non-test environments fail closed until a separately approved
provider candidate exists. Reveal accepts both verified `LOCKED` and unverified
`REVEAL_READY`, but only verified evidence can supply the representative thought
or a self-discovery claim. `conway-law` v5 remains unscheduled; E2E activates it
only through a test-owned PostgreSQL fixture rather than production selection.

The development-only Final Synthesis verifier v2 is a separate, non-runtime
line. Its proof contract makes endorsement, synthesis-local reference resolution,
and component-local semantic shape orthogonal; canonical no-support records use
`NOT_APPLICABLE` and empty evidence. Its evaluator retains redacted proof facts
and every operational attempt, including recovered validation failures. V1 live
evidence remains immutable, v2 has no selected candidate model, and production
composition remains unchanged.

M4-A adds a provider-free Adaptive Guidance foundation without changing gameplay
or persistence. A pure domain resolver derives learner state from accumulated
semantic node state and reuses the existing semantic-lock eligibility rule. A
second pure selector maps that state to a deterministic guidance action, target
node, and approved content text. Conway v6 uses approved content schema v4 and is
unscheduled; it adds only the server-owned `adaptive_guidance` policy and omits the
research-era Lock Verifier and Final Synthesis policies. The OpenAI Judge adapter's
default prompt now selects the already-evaluated, byte-preserved `judge-v3`.
M4-B branches deterministic policy on `adaptive_guidance`, after the existing
Judge validation and semantic merge. Turn 1 remains THINKING for every learner
state; Turn 2 is independently judged and becomes REVEAL_READY, never LOCKABLE or
SYNTHESIZING. The existing application reservation/version-fencing flow is reused.
Public projection adds only learner state, approved feedback, optional action and
target node ID, and answer/Reveal capabilities; rubric and evidence stay private.

Existing `guidance_events` stores keys rather than text. Adaptive keys encode
`adaptive-v1:1:<learner-state>:<action>:<target-or-empty>` and
`adaptive-v1:2:<learner-state>`. The store rehydrates Turn 1 text from immutable
approved content and Turn 2 text from generic deterministic terminal copy. No
schema migration or derived-state column is needed. Reloaded adaptive REVEAL_READY
sessions remain on Play to show feedback and await an explicit Reveal action;
legacy terminal routing is unchanged. Nonadaptive policy and Final Synthesis
research paths remain intact. Readiness and pause/resume belong to M4-C; v6 remains
unscheduled/live-disabled and there is no AI-free fallback.

M4-C introduces `SemanticAiReadinessPort` and a replaceable non-generation probe.
The OpenAI adapter retrieves the configured primary Judge model with SDK retries
disabled and a 10-second request timeout. It returns only READY/UNAVAILABLE,
without logging credentials or provider bodies. This is connectivity/auth/model
metadata access evidence, not a guarantee of inference quota, Structured Outputs
compatibility, or semantic quality. No live probe is executed in implementation.

An application monitor uses injected ClockPort, caches READY for 60 seconds and
UNAVAILABLE for 12 seconds, and coalesces stale checks into one in-flight probe.
Validated Judge success refreshes READY; a final PROVIDER_ERROR attempt invalidates
it. Schema-only errors do not poison global readiness. Newer Judge evidence fences
older probe results. One monitor is composed per configured provider/model/process;
Internal Alpha accepts this process-local cache. Distributed coordination is
deferred unless deployment requires it. Fake readiness is READY only in APP_ENV=test
and cannot be refreshed into READY by fake legacy success in other environments.

New adaptive Official creation requires readiness; an existing Official session
can still be retrieved while unavailable. Adaptive evaluation failures preserve
the reserved user answer and semantic state, persist ERROR_RECOVERABLE via CAS,
and record existing AI-run metadata. A separate evaluation-resume command requires
ownership, adaptive capability, paused status, the expected state version, and one
last answer whose turn/stage matches the interruption. Readiness precedes an atomic
CAS retry reservation; Judge receives the same answer without another INSERT or
turn increment. CAS fences simultaneous/stale/repeated retries. Legacy answer
rollback and Final Synthesis paths remain unchanged.

The existing PostgreSQL session status CHECK did not accept ERROR_RECOVERABLE,
despite the domain vocabulary already defining it. M4-C's minimal new migration
adds only that accepted status; no tables, columns, answer bytes, or historical
migrations change. Apply repository migrations before using adaptive pause in a
database-backed environment. Public pause exposes saved thoughts and resume
capability, never fabricated new feedback or provider details. UI has unavailable
start/retry and persisted-answer resume without new reasoning input or forced
Reveal. M4-D verified the real provider/application path internal-only; Conway v6
remains unscheduled after M4 closure. Daily publication/alpha activation is deferred,
and local DB migration/persistence validation is required before M9.

M5-A derives adaptive Reveal outcomes in a pure domain resolver. Existing
`adaptive-v1:1:<state>:<action>:<target>` guidance metadata preserves the first
semantic decision even after final merge; its validated state distinguishes
independent rediscovery from guided arrival without new persistence. Required-node
progress (one DISCOVERED or two distinct PARTIAL nodes) recognizes partial capture
even alongside misconception. The application adds only code/label/explanation to
the authorized Reveal result, never Play/start/getOwned. Legacy Reveal and the
historical verifier discoveryOutcome are unchanged. There is no numerical score,
provider call, generated comparison, animation or schedule publication in M5-A.

M5-B adds schema v5 Conway v7 with approved `personalized-reveal-v1` mapping inside
REVEAL_CONTENT, preserving four-layer storage and immutable v6 bytes. The pure
domain projection resolves exact thought/evidence spans, chooses at most two
distinct excerpts (positive status/depth first, at most one required divergence),
and omits unusable/oversized evidence. Sanitized omission categories pass through
an optional application callback to the route logger, never the public DTO.
The authorized application response explicitly strips the content mapping and
publishes only labels/excerpts/approved explanations plus canonical insight.
A shared Reveal/Result section consumes that view; legacy content and existing
Reveal timing remain unchanged. No DB migration, provider call, generated prose,
score, v7 schedule publication or M5-C choreography is added.

M5-C keeps choreography entirely in the client with central phase offsets
0/750/1450/2200/3000 ms. Authorized Reveal payloads are session-bound; only the
current thought/time/person/theory phase renders, then stable shared Reveal/Result
content appears immediately. Skip cancels timers with no fetch/navigation/state
mutation; reduced motion bypasses timers. Existing completion POST is independent
of animation and runs in authorized load, allowing REVEALED reloads to route to
stable Result without replay. Legacy normal-completion Result navigation remains
compatible. No server/domain semantic, content, persistence or provider change
is required. M5 is closed; M6 remains not started.

M6-A opens Identity with a provider-neutral Account and separate narrow
AccountStorePort capability on the primary PostgreSQL adapter. Service-only
application boundaries resolve trusted external subjects and claim one explicit
official session/device. Exact-session row locking makes claims atomic; same-owner
replays preserve timestamps and competing owners cannot transfer ownership.
Anonymous provenance and existing authorization remain intact. Claim leaves
gameplay state_version unchanged so in-flight Judge reservations remain valid;
normal transitions leave account columns untouched. No historical history query/merge, public
client-asserted auth route or auth SDK exists. M6 remains open; trusted authentication
integration and login UX belong to M6-B.

M6-B selects Supabase Auth and Google-only OAuth while preserving provider-neutral
TrustedAuthPort/Account. SDKs stay in adapters; getClaims verifies authenticated
JWT sub and maps supabase:<sub>, never email/session-cookie user. Route-local SSR
cookie clients and the exact Next.js src/proxy.ts server entry handle refresh;
Proxy never queries Accounts or blocks anonymous play. Signed 10-minute HttpOnly
pending claim carries one explicit session ID, revalidated against the anonymous
device at callback. Fixed app origin/Origin checks prevent open redirects and
cross-site start/logout. Callback clears intent, preserves login on claim rejection
and never enumerates history. UI receives only safe account ID/claim state, no
tokens. No new DB coupling, auth-based gameplay ownership rewrite or live OAuth
verification; M6-C is next and M6 remains open.
