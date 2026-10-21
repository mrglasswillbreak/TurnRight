# Contributing to TurnRight

TurnRight combines public campus navigation with an authenticated GIS editing and publication workflow. Start with the [project overview](README.md), [architecture](docs/ARCHITECTURE.md), and [editor layout contract](docs/EDITOR-LAYOUT.md).

## Local development

Use Node **22.23.3**, pinned in `.node-version`, and npm **10.9.9**. Run `npm ci` once from the repository root, then `npm run doctor`. The root npm workspace installs the application and tooling with one lockfile. `npm run dev` serves the public seed. The [local editor guide](docs/LOCAL_DEVELOPMENT.md) provides the pinned Python 3.12 Linux/WSL2 environment, Supabase sessions, synthetic roles, storage and workers through `npm run local:up`. Hosted APIs use [deployment configuration](docs/DEPLOYMENT.md). Keep credentials and private acceptance artifacts outside Git.

Read [repository ownership and generated-file conventions](docs/REPOSITORY.md) before moving files. Keep the lockfile with dependency changes, append migrations without renumbering history, and retain source licences and compatibility fixtures. Private backups and local design drafts do not belong in the application tree committed to Git.

## Changes and review

1. Describe the user-visible problem and a reproducible example.
2. Make a focused change. Preserve map identity, recovery, unsaved input and undo when altering editor layout. Treat imports, approval and publication as separate steps.
3. Run the checks below and record any environment limitation. Add a regression test when behavior or data integrity changes.
4. Update the relevant guide and capture affected views using [screenshot maintenance](docs/SCREENSHOTS.md). Keep dated evidence and historical images intact.
5. In the pull request, explain the resulting behavior, validation, and any operational requirements. Do not include private map data, tokens, personal location histories or unlicensed photographs.

## Checks

```sh
npx playwright install chromium webkit
npm run check
npm test -- --maxWorkers=1
npm run test:coverage
npm run check:docs
npm run check:dependencies
npm run build
npm run check:configured-build
npm run test:survey-webkit --workspace web
npm run test:survey-pwa --workspace web
```

Install browser binaries with `npx playwright install chromium webkit` before running browser checks. `check:configured-build` uses isolated authentication placeholders and overwrites local build output; never deploy that fixture build. Produce a normal configured deployment build through the release workflow.

Build scripts enforce map, globe, voice and JavaScript bundle budgets. Use Python 3.12, run `python -m pip install --require-hashes -r scripts/requirements-quality.lock`, run `npm run lint:python`, then `python -m unittest discover -s scripts/tests -v` from the repository root for importer checks. Native-driver and PostgreSQL/restore acceptance use `scripts/requirements-test.lock` and the pinned Linux environments; see [imports verification](docs/CAMPUS-IMPORTS.md#verification). Local skips do not satisfy those gates. Browser fixtures are not a substitute for physical-device or field validation.

V8 coverage includes unimported application, component, server and API modules. `npm run test:coverage` collects passing unit/component tests and Chromium workflows, then enforces 80% statements/lines/functions and 70% branches across their combined application coverage. Unit-only baseline floors and critical API per-file floors remain additional checks. Reports carry a hash of the source, tests and dependency lock; stale or failed runs cannot satisfy the combined gate. Reports are in `web/coverage/combined`. Collection adds no instrumentation to production builds. A focused browser run helps debugging; release evidence requires the complete suite.

`check:architecture` keeps authored JavaScript/TypeScript source, tests and tools below 500 formatted lines, enforces a single workspace lock and requires external CI actions to use immutable commits. Split by responsibility while retaining behavior and public contracts. `check:configuration` checks environment references against `scripts/configuration.json` and the generated [inventory](docs/ENVIRONMENT.md). Add a described entry when introducing a variable, then regenerate with `npm run check:configuration -- --write`.

Reproduce Python locks with uv **0.12.5**: `uv pip compile scripts/requirements-data.txt --python-version 3.12 --python-platform linux --generate-hashes --output-file scripts/requirements-data.lock` and the same command with input `scripts/requirements-test.in` and output `scripts/requirements-test.lock`. Use `--upgrade` only for an intentional dependency update, review the lock diff and run normal CI. The separate voice environment and pinned native GIS images retain their existing toolchains.

Python coverage reports retain all discoverable `scripts` modules. The enforced processing scope includes every module in `scripts/map_import`, the import host, GIS processor, source scheduler, retention cleaner, diagnostics and source-observation contracts. These are the live editor worker runtime; optional ArcGIS desktop studies, historical campus enrichment and voice-generation tools remain visible in the overall report. `python scripts/test_python.py` runs all tests, rejects native-driver skips, records the source/lock hash and enforces 80% lines and 70% branches for processing. Run it in the `test` target of `scripts/map_import/Dockerfile`; CI publishes both the complete report and `processing-summary.json`. Direct `python -m unittest discover -s scripts/tests -v` remains useful on Windows, but its native-driver skips do not satisfy acceptance.

Weekly Python dependency updates cover the core import/GIS and test manifests.
Regenerate both affected hash locks when reviewing a manifest update before
merging through normal protected CI. The voice `.in` and `.txt` manifests are
excluded from this general scan: their pinned inference environment is maintained
and validated separately, so its resolver constraints do not block core updates.

Format changed files with `npx oxfmt <files>`. Documentation validation covers all tracked and new non-ignored Markdown files, local heading anchors, filename case, and current screenshot hashes/dimensions. For a fresh gallery, use `npm run docs:prepare --workspace web`, an explicit new `TURNRIGHT_DOCS_DATE`, the documented capture journeys, then `npm run docs:record --workspace web`. See [screenshot maintenance](docs/SCREENSHOTS.md#reproduce). Keep historical evidence intact and inspect every image.

## Data and licensing

Report security issues through the process in [SECURITY.md](SECURITY.md). Dependency audit findings must be assessed and repaired without blind major-version upgrades; run the affected tests and build again after changing the lockfile.

Retain source attribution, licence terms, provenance and access restrictions. Never infer public redistribution rights from an accessible URL. Publication requires the existing independent approval flow. Source and photograph licences are documented in [data attribution](data/ATTRIBUTION.md) and [photo records](data/photos/README.md). [LICENSE](LICENSE) records proprietary software intent; [THIRD_PARTY.md](THIRD_PARTY.md) retains separate dependency and asset terms. Contributing does not imply an additional licence grant. Preserve development history and authorship.

For [campus detail research](docs/CAMPUS-DETAIL-UPGRADE.md), keep ArcGIS/REA evidence in ignored research output or a separate private archive. ArcGIS Pro is optional for application development; native project and analysis scripts use its own Python environment. Preserve original IDs, CRS/units, survey and retrieval dates, permissions, file hashes and transformation history in exchange bundles. Illustrative scenery never creates surveyed features or routing connections. Test changes against both campuses and older packages, and record the exact source revision and package versions for browser checks.
