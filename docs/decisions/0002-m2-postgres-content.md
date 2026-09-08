# 0002 — Direct PostgreSQL adapter and immutable approved content

Status: accepted for M2

## Decision

Use `postgres.js` inside `src/adapters/postgres-primary-store` as the only production primary-store implementation. Repository-owned SQL migrations target PostgreSQL 16/Supabase PostgreSQL without importing a Supabase SDK. Domain and application layers depend only on `PrimaryStorePort`.

Approved content is a versioned four-layer JSON file under `content/approved`, while editorial Daily assignments live separately under `content/schedule`. Seeding computes a canonical SHA-256 over immutable content metadata and the four layers only, refuses a changed payload for an existing `(content_item, version)`, and requires exact compatibility for existing schedule dates.

## Consequences

- PostgreSQL constraints arbitrate Official attempt and completion uniqueness.
- Normalized answer/evidence storage preserves `user_answers.text` as the single raw-thought source.
- A session always loads policy and Reveal from its bound immutable content version.
- Adding a Daily assignment does not change content identity or require a new content version.
- Supabase Auth, generated database clients, query builders, Redis, and AI providers remain absent.
