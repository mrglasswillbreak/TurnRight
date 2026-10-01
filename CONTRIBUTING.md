# Contributing to TurnRight

Thanks for contributing.

## Start here

1. Read `/README.md` and `/docs/README.md` for product and workflow context.
2. Follow environment requirements in `/docs/DEPLOYMENT.md` and `/docs/CONFIGURATION.md`.
3. Keep changes scoped: avoid unrelated refactors, schema rewrites, or workflow churn.

## Branching and pull requests

- Open pull requests against `main`.
- Keep one focused objective per PR.
- Link related issue(s) and explain user impact, risk, and verification.
- Use `/home/runner/work/TurnRight/TurnRight/.github/pull_request_template.md` sections.

## Required quality gate

Every PR must pass the **Core quality gate** workflow:

- Unit tests (`npm test`)
- Lint/type checks (`npm run lint`)
- Configured production guard (`npm run check:configured-build`)
- Complexity budget check (`npm run check:complexity`)
- Critical browser suite (Playwright PWA profile)

Heavier workflows (full regression shards and full GIS container regressions) are tiered checks and are not required on every change.

## Ownership and review routing

- `web/**`: public map, editor, PWA UI/runtime
- `scripts/**`: import/release/source automation
- `supabase/**`: schema and RPC contract changes
- `.github/workflows/**`: CI/CD and release operations

Route reviewers according to `/home/runner/work/TurnRight/TurnRight/.github/CODEOWNERS`.

## Issue and PR expectations

- Use issue templates for bug reports and features.
- Include reproducible steps, environment, and expected behavior.
- For workflow or operational changes, update the matching docs and verification note in the same PR.
- For migration changes, document ordering and rollback notes in `/docs/OPERATIONS-CHECKLIST.md` and `/docs/DEPLOYMENT.md`.

## Security and secrets

- Never commit credentials, service-role keys, or `.env` files.
- Follow `/docs/SECURITY-HYGIENE.md` for dependency cadence and scanning policy.
- Use `/SUPPORT.md` for disclosure routing; do not report security issues publicly first.
