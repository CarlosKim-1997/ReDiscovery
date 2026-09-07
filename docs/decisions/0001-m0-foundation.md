# ADR 0001 — Foundation before the game

Status: accepted for M0 implementation; subordinate to the canonical packet.

## Context

The repository was empty. The first implementation must establish an executable,
testable foundation without advancing into the Conway/FakeJudge walking skeleton.

## Decisions

1. Use Next.js App Router, strict TypeScript (including unchecked index access and
   exact optional properties), Tailwind via PostCSS, Zod, Vitest, and Playwright.
   Pin direct versions and commit pnpm's lockfile. No external font fetch at build.
2. Add only the currently exercised ClockPort and SystemClock adapter. Reserve
   future architectural locations in documentation, without placeholder APIs.
3. Use a minimal liveness route to verify application/port/adapter composition.
   Do not introduce `/api/system/status` circuit semantics before M7.
4. Enforce dependency direction and ambient clock restrictions through ESLint,
   with regression tests for the guard. Mark server config/composition server-only.
5. Validate config before serving/building; defaults permit local boot without keys.
6. Use a temporary Korean preparation page for browser smoke verification.
   G1 stays an internal identifier. No final branding or playable content is chosen.
7. CI runs lint, type generation/typecheck, unit/architecture tests, production
   build, and Chromium desktop/mobile smoke tests. E2E owns its server on port 3100.

## Version selection sources

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js August 2026 security release](https://nextjs.org/blog/august-2026-security-release)
- [Tailwind Next.js integration](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
- [Vitest guide](https://vitest.dev/guide/)

Stable npm metadata was checked during implementation. Next.js 16.3.4 is newer
than the 16.3.3 security patch identified in the August advisory. Exact resolved
versions are recorded in `package.json` and `pnpm-lock.yaml`; the product does not
require these exact patch numbers forever.

The Node baseline is 24.19.0 LTS with pnpm 11.19.0. TypeScript 6.0.3 is selected
because the current typescript-eslint parser requires TypeScript below 6.1.
ESLint 10.10.0 uses the official Next plugin and typescript-eslint directly;
the bundled eslint-config-next includes plugins whose peers exclude ESLint 10.
The final dependency graph has no peer conflicts. Generated `next-env.d.ts` is
ignored and recreated by `next typegen` before typechecking a fresh checkout.

## Consequences / deferred work

No database, AI credentials, content approval, publication, OAuth, or vendor
accounts are needed to validate M0. Gold Eval remains a gate before enabling a real
Judge. Feature flags, content schemas, sessions, privacy retention implementations,
and gameplay are not prematurely added. M1 starts only after the M0 report.
