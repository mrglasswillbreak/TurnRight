# Repository structure and maintenance

TurnRight is one deployable web application with separate data-processing workers. The repository keeps runtime code, source evidence, migrations, and user documentation distinct. [Architecture](ARCHITECTURE.md) describes the data and security boundaries.

## Directory ownership

| Path                                        | Contents and conventions                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/src/`                                  | Public map/globe, navigation/offline code, editor workspaces, geometry/model/photo modules, and colocated styles. Feature prefixes such as `world-`, `model-`, `source-` and `gis-` group related modules.                   |
| `web/components/`, `web/hooks/`, `web/lib/` | Shared UI primitives, reusable hooks and UI utilities. Domain behavior belongs in `src/`.                                                                                                                                    |
| `web/api/`                                  | Vercel HTTP entry points; authentication, request parsing and dispatch.                                                                                                                                                      |
| `web/server/`                               | Server-only campus permissions, database operations, processing, review and publication.                                                                                                                                     |
| `web/public/`                               | Assets deliberately served to every visitor: icons, verified map packages, world data, glyphs, audio and vendored codecs. Never put drafts, credentials or recovery exports here.                                            |
| `web/tests/`                                | Unit/database tests, browser journeys, isolated harnesses and attributed regression fixtures.                                                                                                                                |
| `web/scripts/`                              | Web-specific build budgets, asset generation, browser capture and performance verification.                                                                                                                                  |
| `scripts/`                                  | Importers, shared source comparison, isolated GIS workers, release transport and data tooling. `map_import/` and `gis/` hold their worker implementations; `tests/` holds Python/native checks.                              |
| `supabase/migrations/`                      | Immutable numbered migration history; new schema changes append a migration.                                                                                                                                                 |
| `data/`                                     | Attributed source/seed data, licence records, research ledgers and data verification outputs.                                                                                                                                |
| `docs/`                                     | Current guides and explicitly dated audits/deployment history. `assets/brand/` holds selected identity assets; `assets/screenshots/` holds unaltered captures and manifests; `assets/measurements/` holds benchmark records. |
| `.github/workflows/`                        | CI, opt-in source refresh, processing, maintenance, and reviewed release jobs.                                                                                                                                               |

Module locations form part of existing worker, build, and test contracts. Move a module when ownership changes or it has a clear reusable boundary; update imports, tests, worker URLs, configuration, and documentation together. Alphabetical filenames and the documentation index provide navigation without renumbering source files. SQL filenames are ordered deliberately and must not be renamed for presentation.

Shared UI includes only the six primitives currently referenced by application code or test harnesses: button, dialog, dropdown menu, toggle, toggle group, and tooltip. Add a new primitive when a feature actually uses it; do not regenerate an entire unused component catalogue or install its optional dependency stack.

## Generated and local files

`web/dist/`, `web/work/`, `web/outputs/`, `test-results/`, Playwright reports, dependency directories, Python caches, TypeScript build metadata, `.vercel/`, `.vs/`, local environment files, raw downloads, and local backup/design-exploration folders are ignored. They are not deliverables. Keep scripts and reproducible inputs in Git; retain useful verification results in a dated receipt with provenance.

Existing local backup copies and unselected brand drafts are ignored, not product assets. Review their ownership before deletion. Do not use a broad recursive cleanup on `data/`, `web/public/`, migrations, or test fixtures: generated map packages, pinned codecs, public model assets, and historical evidence can be intentional versioned inputs.

## Documentation and evidence

- Start at [the documentation index](README.md). Current instructions describe the current source; dated audits describe the revision and environment they actually tested.
- Update feature guides with behavior changes. A screenshot of a local fixture is not proof of deployment, performance, physical-device behavior, or route safety.
- Store fresh screenshots under a new date and record source/package/browser identities and hashes. Follow [Screenshot maintenance](SCREENSHOTS.md).
- Keep accepted source observations, licences, historical model fingerprints, migration files, deployment receipts, and test fixtures even when a newer version exists. They support attribution, compatibility, and recovery.
- Run `npm run check:docs` from `web/` for every documentation or file-location change. It checks all versioned and new non-ignored Markdown files and local links/assets.

## Toolchain and checks

Node is pinned in the root runtime files; `web/package-lock.json` is the dependency lock. Use `npm ci`, not a dependency upgrade, for routine setup. Python worker dependencies are pinned in `scripts/requirements-*.txt` and the container definitions. See [Contributing](../CONTRIBUTING.md) for checks and [Deployment](DEPLOYMENT.md) for production configuration.

For files outside `web/`, run the formatter from the repository root: `node web/node_modules/oxfmt/bin/oxfmt --config web/.oxfmtrc.json <files>`. The formatter rejects parent-directory (`..`) paths; use paths relative to the working directory.
