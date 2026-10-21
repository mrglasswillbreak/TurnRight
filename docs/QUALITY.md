# Repository quality and reproducible checks

This page maps implementation to executable evidence. It is not a predicted external score. The 21 October DataFactor assessment scored 65.1, up from 46, but missed existing Compose, dependency locks, configuration documentation and custom diagnostics. Its recommendation to add a runnable suite conflicts with its recognition of the CI suites. The [follow-up record](READINESS-FOLLOWUP.md) distinguishes corrections from new work.

| Area | Authoritative configuration | Reproduce / evidence |
| --- | --- | --- |
| Workspace dependencies | Root `package.json` declares `web`; `web/package.json` contains runtime dependencies; root `package-lock.json` resolves both | Root `npm ci`, `npm run check:dependencies` |
| JS/TS lint and formatting | Root `.oxlintrc.json`, `.oxfmtrc.json` | `npm run lint`, `npm run format:check` |
| Type checking | Four projects under `web/tsconfig*.json` | `npm run typecheck` |
| Python quality and portable tests | `pyproject.toml`, root `requirements.txt` includes `scripts/requirements-quality.lock` | Python 3.12: `python -m pip install --require-hashes -r requirements.txt`, `npm run lint:python`, `npm run test:python` |
| Native processing | `scripts/map_import/Dockerfile`, `scripts/gis/Dockerfile`; separate hashed runtime/test locks | Linux/WSL2: `npm run test:python:isolated`; CI requires real GDAL/osmium with no skipped tests |
| Application coverage | `web/vitest.config.ts`, `scripts/coverage-scope.mjs`, `scripts/check-coverage.mjs` | `npm run test:coverage`; unit and all primary Chromium journeys must match the same source/test/tool/lock fingerprint |
| Python coverage | `pyproject.toml`, `scripts/check_python_coverage.py` | Native processing includes all import modules, GIS processing helpers and host monitoring; complete script coverage remains visible separately |
| Local editor | `Dockerfile`, `docker-compose.yml`, `.devcontainer/devcontainer.json` | `npm run local:container`, `npm run local:test`; actual local Auth, storage, role/campus isolation and private workers |
| Configuration | `scripts/configuration.json` generates `.env.example` and `docs/ENVIRONMENT.md` | `npm run check:configuration` fails on unknown references or template/document drift |
| Module structure | `scripts/check-architecture.mjs` | `npm run check:architecture`; fewer than 500 formatted lines for authored JS/TS/Python, including tests/tools |
| Security | `.github/workflows/security.yml` | Mandatory full-lock audits, pinned Semgrep rules, historical Gitleaks and a deleted-credential regression |
| Error tracking | `web/server/error-monitoring.mjs`, `scripts/error_monitoring.py`, migration 057 | Owner-only System health, native database permission/concurrency/retention checks and delivery/redaction/UI tests |

Dependencies and browser/container images must first be downloaded. Native conversion runs with `--network none`; no live ArcGIS/Overpass accounts or production credentials are needed for acceptance. Portable Python tests may skip unavailable native drivers and cannot substitute for that gate.

Unit coverage alone and combined application coverage are different measurements. Test-file counts, category scores and source-file ratios are not coverage percentages. The gate preserves unexecuted modules and does not reduce includes to obtain a higher number. CI artifacts record the actual measured revision; [PR #47](https://github.com/mrglasswillbreak/TurnRight/pull/47) retains the preceding deployment's measurements.

The repository has real solo history beginning 8 September 2026. Tags identify actual releases, and contributor identities remain authentic. No change here implies independent human review or physical-device/field acceptance.
