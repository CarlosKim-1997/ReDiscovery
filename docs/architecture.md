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
