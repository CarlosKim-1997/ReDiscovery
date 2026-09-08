# Adapters

M2 composes `SystemClock`, deterministic `FakeJudgeAdapter`, `NodeIdentityAdapter`,
and the server-only `PostgresPrimaryStore`. The direct PostgreSQL protocol client is
isolated here; no database dependency crosses into ports/application/domain.
Supabase Auth, Upstash, OpenAI, Turnstile, and Sentry remain unimplemented.
