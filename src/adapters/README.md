# Adapters

M0 implements `system-clock/SystemClock`. M1 adds `FakeJudgeAdapter` and
`InMemoryPrimaryStore`, both deterministic and free of network/vendor dependencies.
Supabase, Supabase Auth, Upstash, OpenAI, Turnstile, and Sentry code will belong here
when their milestone starts. No vendor SDKs are installed or invoked through M1.
