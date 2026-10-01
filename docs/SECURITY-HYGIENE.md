# Security and dependency hygiene

## CI policy

TurnRight uses two default policy workflows on `main` push/PR:

- **Core quality gate**: lint, unit tests, configured build guard, complexity budget check, critical browser suite.
- **Security hygiene**: dependency review on PRs and repository secret scanning.

Heavy GIS/runtime regressions remain tiered checks and do not replace policy gates.

## Dependency update cadence

| Area | Cadence | Notes |
| --- | --- | --- |
| React / React DOM / Vite | Monthly | Prioritize compatibility and bundle budget checks |
| MapLibre + map rendering stack | Monthly | Re-run map/display and browser route smoke checks |
| Supabase client/server dependencies | Monthly | Re-check auth/session and release workflows |
| GIS Python/runtime dependencies | Quarterly or on CVE | Validate map-import container regressions |
| Playwright / test runtime | Monthly | Keep browser workflows reproducible |

Security patches should be expedited outside cadence.

## Secrets policy

- Keep service keys only in Vercel/GitHub/Supabase secret stores.
- Never commit `.env` files, service-role keys, OAuth secrets, or workflow tokens.
- Keep environment/secrets source-of-truth in `/docs/CONFIGURATION.md` and setup sequence in `/docs/DEPLOYMENT.md`.

## Responsibility map

- `web/**`: frontend dependency updates and browser-facing validation.
- `scripts/**`: import/release automation dependency updates.
- `supabase/**`: migration and RPC security compatibility.
- `.github/workflows/**`: CI policy and scanning enforcement.

## Required documentation updates

Any security/dependency policy or workflow change must update:

1. `/docs/SECURITY-HYGIENE.md`
2. `/docs/CONFIGURATION.md` (if env/secrets behavior changed)
3. `/docs/DEPLOYMENT.md` or `/docs/OPERATIONS-CHECKLIST.md` (if operational behavior changed)
