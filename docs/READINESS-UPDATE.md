# Repository readiness update

This work addresses the DataFactor assessment dated 19 October 2026. The
baseline is `cb52b36371d2dc0baac012a9a072620dcae0b017`. The assessment missed
existing coverage, lint, local-stack and protected CI gates; the measured
coverage and large modules still require substantial improvements.

## Completion contract

- [x] One npm workspace lock, reproducible installation and both deployment paths.
- [x] Complete configuration inventory, runtime doctor and local container entry.
- [x] Authored source, test and tool lint/type checks; structural regression gate.
- [x] Domain refactors, including the four named components and large browser suite.
- [ ] Application coverage: 80% statements, lines and functions; 70% branches.
- [x] Python processing coverage: 80% lines and 70% branches.
- [x] Correlated, privacy-safe client/API/worker diagnostics without a hosted service.
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

## Assessment mapping

The assessment reported an overall 46 with a qualification threshold of 70.
This table maps its category scores to concrete changes, not predicted scores.

| Category | Assessed score | Response |
| --- | --- | --- |
| Cleanliness | 25 | Repository-wide lint and formatting, expanded TypeScript checks, and a formatted-file size gate |
| Architecture | 45 | Separate UI views, lifecycle hooks, domain operations and shared test fixtures |
| Testing | 55 | Full-source unit/browser coverage, complete-journey verification, native Python coverage, and additional boundary/failure tests |
| Dependencies | 45 | One root npm workspace lock, pinned supported toolchain, hash-locked native dependencies and advisory fixes |
| Documentation | 60 | Complete configuration inventory, local setup, diagnostic recovery and an evidence ledger |
| CI | 40 | Explicit root CI, preserved required contexts, reproducible containers, exact-source coverage receipts and pinned Actions |
| Security | 65 | Dependency review/audits, CodeQL, secret scanning, and bounded diagnostics without private content |
| History | 45 | A reviewable change, factual changelog and links to actual checks; existing authorship and historical evidence are preserved |

The evaluator must reassess the final reviewed revision. Authorship, elapsed
project history and independent human review are not fabricated to improve a score.

## Implementation evidence

### Changes under verification

The root is now a private npm workspace with one lockfile and the supported
Node 22.23.3/npm 10.9.9 toolchain. Root commands cover installation, development,
the production build, quality checks and combined application coverage. Vercel,
preview and release scripts resolve dependencies from that same workspace.
The configuration inventory documents 76 settings and rejects undocumented
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

The history secret scan enumerates every reachable Git blob, including deleted
file versions, and scans each unique version with Gitleaks' bounded file reader.
The original detection rules and recursive decoding remain enabled. Narrow
exceptions match exact public walking-policy identifiers and integrity digests
in their documented artifact fields; truncated reader-boundary fragments are
limited to two immutable historical blob IDs. A temporary-repository self-test proves
that a deleted credential in the same file still fails and that output omits
secret values. Temporary historical contents and reports are removed after the run.

### Verification ledger

The following results were obtained during implementation, not on a published
release. A result must be repeated if its relevant source subsequently changes.
The first complete Linux verification attempt used
[`9a5290e`](https://github.com/mrglasswillbreak/TurnRight/commit/9a5290ed9d6d52e03d75549da18c1a7f5ae09b8f).
See its [CI run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39526884060),
[security run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39526884103)
and [native database/engine run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39526884052).

| Check | Observed result | Remaining verification |
| --- | --- | --- |
| Root quality | Doctor, all 76 configuration entries, 909 authored files below 500 lines, lint, four type checks and formatting passed | Repeat after final code changes |
| Documentation | 1,013 links/assets in 82 Markdown files; 33 capture references passed, including inspected desktop/phone recovery views | Repeat after this ledger is finalized |
| Unit/component tests | Windows pinned runtime: 994 passed in 152 files, followed by nine passing texture/source-review checks; Linux baseline: 910 passed and one optional private-export replay skipped | Repeat the full suite on the final revision |
| Unit coverage alone | Windows: 47.37% statements, 47.68% lines, 46.45% functions, 44.02% branches; all 530 source files included | Complete final browser collection and the combined gate |
| Production bundles | Public 433,436/435,200 bytes gzip; additional editor 186,350/189,440; photo 11,660/12,288 | Existing budgets remain unchanged |
| Native Python | All 149 tests passed on Linux without skips; processing coverage is 83.11% lines and 74.60% branches in [run 39531746245](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39531746245) | Repeat if Python processing code changes |
| Dependency audits | npm and Python quality/native profiles passed in Linux CI; identified certifi and PyArrow advisories were fixed | Repeat if locks change |
| Workflow syntax | All workflows passed actionlint | Repeat after the final security workflow edit |
| Browser acceptance | All 204 primary Chromium journeys, both WebKit shards, the WebKit image editor and separate offline suites passed in [run 39531746310](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39531746310) | Repeat on the final source snapshot and complete combined coverage |
| Container/local stack | Linux fresh checkout passed root container build, real Auth, role/campus isolation, editing/review/import/export, private assets, cancellation, browser sign-in, restart persistence and explicit reset | Repeat if runtime or configuration changes |
| Native database/engine | PostGIS spatial acceptance and restoration of 100,000 indexed features passed; isolated processing and private worker cleanup passed | Repeat if native runtime changes |
| Code scanning | JavaScript/TypeScript, Python and Actions CodeQL checks passed | Repeat on final revision |
| Secret scan | Bounded full-history scan passed locally: 5,936 unique file versions across 836 reachable commits; deleted-credential self-test passed | Repeat on the final CI checkout |

Generated coverage, traces and test output remain in ignored directories or CI
artifacts. The independent public archived source replay fixture remains in the
repository; optional private source exports are not required for the default
fresh-clone suite. No release, complete final CI success or DataFactor rescore is
claimed by this ledger. The final review must include actual passing receipts, the
remaining limitations, and the exact revision submitted for reassessment.
