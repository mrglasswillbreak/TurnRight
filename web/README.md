# Web application

This directory is the Vercel application root and the application package within the root npm workspace. Use Node **22.23.3** and npm **10.9.9**. Install and run the following commands from the repository root:

```sh
npm ci
npm run doctor
npm run dev
```

The development server runs the public seed without credentials. It does not emulate `api/` or Supabase. For the complete local editor, use [local development](../docs/LOCAL_DEVELOPMENT.md); for hosted team editing, follow [Deployment](../docs/DEPLOYMENT.md). [Environment template](.env.example).

| Path                            | Role                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| `src/`                          | Public map/globe, routing, offline storage, team editor and domain modules |
| `components/`, `hooks/`, `lib/` | Shared interface primitives and utilities                                  |
| `api/`, `server/`               | Vercel entry points and server-only operations                             |
| `public/`                       | Intentionally public runtime assets; no private exports                    |
| `tests/`                        | Unit/database tests, Playwright journeys and regression fixtures           |
| `scripts/`                      | Build checks, asset preparation, measurements and documentation captures   |
| `work/`, `dist/`, `outputs/`    | Ignored local work and generated output                                    |

Run root `npm test -- --maxWorkers=1`, `npm run check`, `npm run test:coverage`, and `npm run build` for the main checks. `npm run check:configured-build` additionally measures the bundle with isolated authentication configuration; do not deploy that fixture output. Package-specific commands can use `--workspace web`; browser commands in [Contributing](../CONTRIBUTING.md) run from this directory and resolve the root-installed tools.

For campus-detail research, `scripts/prepare-campus-detail.ts` creates local presentation candidates; `serve-campus-detail.mjs` and `review-campus-detail.mjs` provide bounded previews and fixed views. `research-editor-workflows.mjs` uses pinned REA/iD research separately from application data. Follow the [detail guide](../docs/CAMPUS-DETAIL-UPGRADE.md) for inputs, dependencies and evidence scope. Actual release previews use the approved-snapshot workflow; `verify-campus-detail.mjs` checks declared assets, browser views and offline journeys against identified packages. A local candidate or successful app build does not publish campus data.

Campus IDs and public slugs are distinct: use the stored campus ID for release workflows and the slug for public URLs. Verification receipts identify both the app revision and campus package versions. Migration 056 must precede the matching publication worker; a promotion that succeeded before database completion timed out must use the guarded [recovery procedure](../docs/DEPLOYMENT.md#publication-completion-after-a-timeout), preserving the other campus and exact approved snapshot.

[Project overview](../README.md) · [Architecture](../docs/ARCHITECTURE.md) · [Repository structure](../docs/REPOSITORY.md) · [Screenshot capture](../docs/SCREENSHOTS.md).
