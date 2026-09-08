# 0002 — Direct PostgreSQL adapter and immutable approved content

Status: accepted for M2

## Decision

Use `postgres.js` inside `src/adapters/postgres-primary-store` as the only production primary-store implementation. Repository-owned SQL migrations target PostgreSQL 16/Supabase PostgreSQL without importing a Supabase SDK. Domain and application layers depend only on `PrimaryStorePort`.

Approved content is a versioned four-layer JSON file validated with Zod. Seeding computes a canonical SHA-256 hash, refuses a changed payload for an existing `(content_item, version)`, and schedules only files under `content/approved`.

## Consequences

- PostgreSQL constraints arbitrate Official attempt and completion uniqueness.
- Normalized answer/evidence storage preserves `user_answers.text` as the single raw-thought source.
- A session always loads policy and Reveal from its bound immutable content version.
- Supabase Auth, generated database clients, query builders, Redis, and AI providers remain absent.
