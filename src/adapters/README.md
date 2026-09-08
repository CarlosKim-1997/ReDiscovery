# Adapters

M3 composes `SystemClock`, selectable `FakeJudgeAdapter`/`OpenAIJudgeAdapter`,
`NodeIdentityAdapter`, and the server-only `PostgresPrimaryStore`. PostgreSQL and
OpenAI SDK dependencies are isolated here; neither crosses into
ports/application/domain. Supabase Auth, Upstash, Turnstile, and Sentry remain
unimplemented.
