# Repository readiness update

This work addresses the DataFactor assessment dated 19 October 2026. The
baseline is `cb52b36371d2dc0baac012a9a072620dcae0b017`. The assessment missed
existing coverage, lint, local-stack and protected CI gates; the measured
coverage and large modules still require substantial improvements.

## Completion contract

- [ ] One npm workspace lock, reproducible installation and both deployment paths.
- [ ] Complete configuration inventory, runtime doctor and local container entry.
- [ ] Authored source, test and tool lint/type checks; structural regression gate.
- [ ] Domain refactors, including the four named components and large browser suite.
- [ ] Application coverage: 80% statements, lines and functions; 70% branches.
- [ ] Python processing coverage: 80% lines and 70% branches.
- [ ] Correlated, privacy-safe client/API/worker diagnostics without a hosted service.
- [ ] Secret-free fresh-clone and prepared offline acceptance.
- [ ] Required CI, dependency/security checks and exact-revision verification receipts.
- [ ] Reviewed release and rescore evidence.

Keep these items incomplete until supported by actual verification. Preserve
coverage includes, test assertions, package compatibility, campus isolation,
independent review, source rights, immutable historical evidence and bundle
budgets. No numerical external score is guaranteed.

## Baseline

The local baseline passed 888 tests in 121 files with 38.24% lines, 38.17%
statements, 32.42% functions and 36.05% branches. Both npm audits were clean.
There were 41 authored code/test files above 500 lines, including 14 above
1,000. The editor browser suite contained 11,225 lines. Thirteen GitHub checks
were required on `main`.

Local baseline checks used Node 26; the existing passing GitHub runs used
Node 22.23.3. The implementation must verify its supported pinned toolchain.

## Implementation evidence

### Changes under verification

The root is now a private npm workspace with one lockfile and the supported
Node 22.23.3/npm 10.9.9 toolchain. Root commands cover installation, development,
the production build, quality checks and combined application coverage. Vercel,
preview and release scripts resolve dependencies from that same workspace.
The configuration inventory documents 74 settings and rejects undocumented
environment references or server secrets exposed through public Vite settings.

Large UI modules now separate views, state, lifecycle and domain operations.
The map, survey, campus workspace, layer editor, photo tools and model editors
retain their public interfaces. The large editor browser suite is split into
domain suites with shared fixtures and its existing assertions. The architecture
gate enforces fewer than 500 formatted lines in authored TypeScript/JavaScript
source, tests and tools. Lint and four TypeScript projects cover those files.

Application coverage combines unit/component tests with actual browser journeys,
includes unexecuted application modules, and requires 80% statements, lines and
functions plus 70% branches. Reports carry a hash of source, tests, tools and
dependency locks; stale or failed runs cannot satisfy the gate. These targets
remain unverified until the complete combined run passes.

The Python processing gate covers every import module and the shipping GIS,
source-check, cleanup and diagnostic entry points. The full Python report also
shows optional research and authoring tools; their coverage is not represented
as meeting the processing threshold. Native acceptance requires GDAL and osmium
and rejects skipped tests. New tests exercise public-host network boundaries,
bounded cached downloads, import orchestration, cancellation, scheduling,
provenance, remote source reuse and failure cleanup.

Client diagnostics remain bounded, in memory and explicitly exported. API and
worker diagnostics correlate safe request and job identifiers without payloads,
credentials or private content. See [diagnostic behavior](DIAGNOSTICS.md).

The primary CI workflow exposes root quality, browser coverage and local-stack
acceptance while preserving the thirteen required check names. Additional
security jobs audit npm and locked Python dependencies, scan Git history for
secrets, and analyze JavaScript/TypeScript, Python and Actions with CodeQL.
External actions use verified commit SHAs. Dependency updates are configured
for the workspace, Python workers, Dockerfiles and Actions.

### Verification ledger

The following results were obtained during implementation, not on a published
release. A result must be repeated if its relevant source subsequently changes.

| Check | Observed result | Remaining verification |
| --- | --- | --- |
| Root quality | Doctor, configuration, architecture, lint, four type checks and formatting passed | Repeat after final changes |
| Documentation | 1,009 links/assets in 82 Markdown files; 31 capture references passed | Repeat after this ledger is finalized |
| Unit/component tests | 910 tests in 123 files passed | Repeat after the final diagnostic changes |
| Unit coverage alone | 38.09% statements, 38.14% lines, 32.17% functions, 36.18% branches; 530 files represented | Complete browser collection and the combined gate |
| Production bundles | Public 433,436/435,200 bytes gzip; additional editor 186,350/189,440; photo 11,660/12,288 | Existing budgets remain unchanged |
| Native Python | 140 tests passed without skips; processing 80.35% lines and 71.87% branches | Repeat with the updated dependency lock and additional tests |
| Dependency audits | npm and Python quality/native profiles passed; identified certifi and PyArrow advisories were fixed | Final audit on the final locks |
| Workflow syntax | All workflows passed actionlint | Repeat after the final security workflow edit |
| Browser acceptance | Focused suites passed; the full run exposed slow real-campus map journeys | Diagnose and complete Chromium, WebKit and offline suites |
| Container/local stack | Pinned images and clean Linux checkout prepared; root build exposed an unused Yarn repository signing-key failure | Verify the Dockerfile fix and complete native/local-stack acceptance |
| Secret scan | Full-history local scan exhausted available memory | Obtain a completed scan; no clean result is claimed |

Generated coverage, traces and test output remain in ignored directories or CI
artifacts. The independent public archived source replay fixture remains in the
repository; optional private source exports are not required for the default
fresh-clone suite. No release, remote CI success or DataFactor rescore is claimed
by this ledger. The final review must include actual passing receipts, the
remaining limitations, and the exact revision submitted for reassessment.
