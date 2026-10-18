# Contributing to TurnRight

TurnRight combines public campus navigation with an authenticated GIS editing and publication workflow. Start with the [project overview](README.md), [architecture](docs/ARCHITECTURE.md), and [editor layout contract](docs/EDITOR-LAYOUT.md).

## Local development

Use Node **22.23.3**, pinned in `.node-version`, and run `npm ci` then `npm run setup` from the repository root. `npm run dev` serves the public seed. The [local editor guide](docs/LOCAL_DEVELOPMENT.md) provides the pinned Python 3.12 Linux/WSL2 environment, Supabase sessions, synthetic roles, storage and workers through `npm run local:up`. Hosted APIs use [deployment configuration](docs/DEPLOYMENT.md). Keep credentials and private acceptance artifacts outside Git.

Read [repository ownership and generated-file conventions](docs/REPOSITORY.md) before moving files. Keep the lockfile with dependency changes, append migrations without renumbering history, and retain source licences and compatibility fixtures. Private backups and local design drafts do not belong in the application tree committed to Git.

## Changes and review

1. Describe the user-visible problem and a reproducible example.
2. Make a focused change. Preserve map identity, recovery, unsaved input and undo when altering editor layout. Treat imports, approval and publication as separate steps.
3. Run the checks below and record any environment limitation. Add a regression test when behavior or data integrity changes.
4. Update the relevant guide and capture affected views using [screenshot maintenance](docs/SCREENSHOTS.md). Keep dated evidence and historical images intact.
5. In the pull request, explain the resulting behavior, validation, and any operational requirements. Do not include private map data, tokens, personal location histories or unlicensed photographs.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run test:coverage
npm run check:docs
npm run check:dependencies
npm run build
cd web
npm run check:configured-build
npm run test:browser
npm run test:survey-webkit
npm run test:survey-pwa
```

Install browser binaries with `npx playwright install chromium webkit` before running browser checks. `check:configured-build` uses isolated authentication placeholders and overwrites local build output; never deploy that fixture build. Produce a normal configured deployment build through the release workflow.

Build scripts enforce map, globe, voice and JavaScript bundle budgets. Use Python 3.12, run `python -m pip install --require-hashes -r scripts/requirements-data.lock`, then `python -m unittest discover -s scripts/tests -v` from the repository root for importer checks. Native-driver and PostgreSQL/restore acceptance use `scripts/requirements-test.lock` and the pinned Linux environments; see [imports verification](docs/CAMPUS-IMPORTS.md#verification). Local skips do not satisfy those gates. Browser fixtures are not a substitute for physical-device or field validation.

V8 coverage includes unimported application, component, server and API modules. Whole-project floors are the pre-refactor baseline rounded down: statements/lines 38%, functions 32%, branches 35%. New domain logic requires 80% statements/lines/functions and 70% branches; focused browser journeys report UI behavior separately. Keep explicit per-module thresholds in `web/vitest.config.ts` when introducing domain logic.

Reproduce Python locks with uv **0.12.5**: `uv pip compile scripts/requirements-data.txt --python-version 3.12 --python-platform linux --generate-hashes --output-file scripts/requirements-data.lock` and the same command with input `scripts/requirements-test.in` and output `scripts/requirements-test.lock`. Use `--upgrade` only for an intentional dependency update, review the lock diff and run normal CI. The separate voice environment and pinned native GIS images retain their existing toolchains.

Weekly Python dependency updates cover the core import/GIS and test manifests.
Regenerate both affected hash locks when reviewing a manifest update before
merging through normal protected CI. The voice `.in` and `.txt` manifests are
excluded from this general scan: their pinned inference environment is maintained
and validated separately, so its resolver constraints do not block core updates.

Format changed files with `npx oxfmt <files>`. Documentation validation covers all tracked and new non-ignored Markdown files, local heading anchors, filename case, and current screenshot hashes/dimensions. For a fresh gallery, use `npm run docs:prepare`, an explicit new `TURNRIGHT_DOCS_DATE`, the documented capture journeys, then `npm run docs:record`. See [screenshot maintenance](docs/SCREENSHOTS.md#reproduce). Keep historical evidence intact and inspect every image.

## Data and licensing

Report security issues through the process in [SECURITY.md](SECURITY.md). Dependency audit findings must be assessed and repaired without blind major-version upgrades; run the affected tests and build again after changing the lockfile.

Retain source attribution, licence terms, provenance and access restrictions. Never infer public redistribution rights from an accessible URL. Publication requires the existing independent approval flow. Source and photograph licences are documented in [data attribution](data/ATTRIBUTION.md) and [photo records](data/photos/README.md). [LICENSE](LICENSE) records proprietary software intent; [THIRD_PARTY.md](THIRD_PARTY.md) retains separate dependency and asset terms. Contributing does not imply an additional licence grant. Preserve development history and authorship.

For [campus detail research](docs/CAMPUS-DETAIL-UPGRADE.md), keep ArcGIS/REA evidence in ignored research output or a separate private archive. ArcGIS Pro is optional for application development; native project and analysis scripts use its own Python environment. Preserve original IDs, CRS/units, survey and retrieval dates, permissions, file hashes and transformation history in exchange bundles. Illustrative scenery never creates surveyed features or routing connections. Test changes against both campuses and older packages, and record the exact source revision and package versions for browser checks.
