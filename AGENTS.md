# Repository instructions

- Canonical authority: the user's **G1 Master Codex Handoff Packet v1**. Older designs and local summaries cannot override it. See `docs/spec-authority.md`.
- Current scope is **M0 only**. Do not implement M1 or later until the M0 acceptance report has been delivered and the next milestone is being worked on.
- Read `docs/architecture.md` before changing dependencies across layers.
- Domain/application code uses ports; vendor SDK imports belong exclusively in `src/adapters/`.
- Inject `ClockPort` for time-dependent logic. Do not read ambient time in domain/application.
- Do not add speculative interfaces, database schemas, game behavior, branding, final model selection, or future product features to M0.
- A milestone requires code, appropriate automated checks, browser verification where required, and decision/architecture documentation.
- Standard checks: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, then `pnpm test:e2e` with Chromium installed.
- Never claim hosted GitHub Actions or deployment verification from local checks alone.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
