# Repository readiness update

This is the evidence record for the first remediation. The later **65.1-point reassessment** and additional implementation are documented in [Readiness follow-up](READINESS-FOLLOWUP.md). Preserve the dated baseline and measured revisions below.

This work addresses the DataFactor assessment dated 19 October 2026. The
baseline is `cb52b36371d2dc0baac012a9a072620dcae0b017`. The assessment missed
existing coverage, lint, local-stack and protected CI gates. This update improves
measured coverage, module structure, reproducibility and verification evidence.

## Completion contract

- [x] One npm workspace lock, reproducible installation and both deployment paths.
- [x] Complete configuration inventory, runtime doctor and local container entry.
- [x] Authored source, test and tool lint/type checks; structural regression gate.
- [x] Domain refactors, including the four named components and large browser suite.
- [x] Application coverage: 80% statements, lines and functions; 70% branches.
- [x] Python processing coverage: 80% lines and 70% branches.
- [x] Correlated, privacy-safe client/API/worker diagnostics without a hosted service.
- [x] Secret-free fresh-clone and prepared offline acceptance.
- [x] Required CI, dependency/security checks and exact-revision verification receipts.
- [x] Reviewer-ready release and rescore handoff evidence.

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
| Security | 65 | Full dependency audits, pinned static analysis, secret scanning, and bounded diagnostics without private content |
| History | 45 | A reviewable change, factual changelog and links to actual checks; existing authorship and historical evidence are preserved |

The evaluator must reassess the final reviewed revision. Authorship, elapsed
project history and independent human review are not fabricated to improve a score.

## Implementation evidence

### Implementation

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
dependency locks; stale or failed runs cannot satisfy the gate. The complete
combined run passed all four targets on the code revision recorded below.

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

Full-suite verification also exposed two rendering/test overhead problems.
The full-screen photo editor no longer blurs an invisible backdrop beneath its
opaque content; desktop capture and editing/recovery checks retain their original
test time limits. Browser camera commands discard unused MapLibre return values
instead of transferring complete map instances through Playwright. All movement,
shader-colour, level-of-detail and recovery assertions remain in place.

The primary CI workflow exposes root quality, browser coverage and local-stack
acceptance while preserving the thirteen required check names. Additional
security jobs audit npm and locked Python dependencies, scan Git history for
secrets, and analyze JavaScript/TypeScript, Python and Actions with Semgrep.
External actions use verified commit SHAs. Dependency updates are configured
for the workspace, Python workers, Dockerfiles and Actions.
GitHub's dependency-review comparison API is unavailable for this private
repository; every pull request instead runs the mandatory audits of all npm
and locked Python dependencies, including unchanged versions. Secret scanning
has only read access to pull-request metadata and repository contents.
Hosted CodeQL scanning is also unavailable for this private personal repository.
Semgrep uses a pinned container digest and community-rule revision, runs inside
the CI runner with metrics disabled, fails on findings or scan errors, and saves
JSON/SARIF reports as private workflow artifacts. It requires no hosted scanner
account and does not upload application source to the scanner provider.
The initial scan prompted XML parser hardening and explicit backup authentication
tag length, with regression tests. Audited false positives have local, rule-specific
comments explaining their constrained inputs; no entire source file is exempted.

The history secret scan enumerates every reachable Git blob, including deleted
file versions, and scans each unique version with Gitleaks' bounded file reader.
The original detection rules and recursive decoding remain enabled. Narrow
exceptions match exact public walking-policy identifiers and integrity digests
in their documented artifact fields; truncated reader-boundary fragments are
limited to two immutable historical blob IDs. A temporary-repository self-test proves
that a deleted credential in the same file still fails and that output omits
secret values. Temporary historical contents and reports are removed after the run.

### Verification ledger

Verification on 21 October 2026 targets code revision
[`d82ecaa`](https://github.com/mrglasswillbreak/TurnRight/commit/d82ecaa87e984da105a7e8bfd43ab072b6013891).
The [pull request](https://github.com/mrglasswillbreak/TurnRight/pull/47) links the
reviewable changes and current checks. Evidence is in the
[main CI run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39546775584),
[security run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39546775602),
[native GIS run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39546775585)
and [database/engine run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39546775609).
Documentation-only changes after this code revision do not alter its tested
application snapshot. Relevant checks must be repeated when source, tests,
configuration or dependency locks change.

| Check | Observed result | Scope or remaining verification |
| --- | --- | --- |
| Root quality | Passed: pinned runtime doctor, all 76 configuration entries, 910 authored files below 500 lines, lint, four type checks and formatting | JavaScript/TypeScript source, tests and tools |
| Documentation | Passed: 1,016 links/assets in 82 Markdown files and 33 capture references, including inspected desktop/phone recovery views | Includes the completed evidence links and release/reassessment handoff |
| Unit/component tests | Linux: 1,004 passed in 155 files; one optional private-export replay skipped | Independent public archived source replay runs in the fresh-clone suite |
| Unit coverage alone | 47.72% statements, 48.04% lines, 46.77% functions, 44.33% branches; all 530 application sources included | Combined coverage also requires the complete browser suite |
| Combined application coverage | Passed: 80.30% statements, 81.51% lines, 80.47% functions and 74.12% branches across all 530 application sources | Complete unit/component suite plus all 204 primary Chromium journeys; targets remain 80% statements/lines/functions and 70% branches |
| Production bundles | Passed: public 433,433/435,200 bytes gzip; additional editor 186,342/189,440; photo 11,661/12,288 | Map, voice, 3D and private/local-code separation checks also pass; budgets unchanged |
| Native Python | All 152 tests passed on Linux without skips; processing coverage is 83.11% lines and 74.60% branches | Real native drivers, locked container and private worker mount; host launch also tested without site packages |
| Dependency audits | npm and Python quality/native profiles passed | Full-lock audits; certifi and PyArrow advisories fixed |
| Workflow syntax | All workflows passed actionlint | External actions remain pinned to immutable commits |
| Browser acceptance | Passed: all 204 primary Chromium journeys, 103 WebKit touch/responsive tests, 15 WebKit image-editor tests and 10 offline tests | No skipped primary journey or omitted journey can satisfy coverage |
| Container/local stack | Fresh checkout passed container build, real Auth, role/campus isolation, editing/review/import/export, private assets, cancellation, sign-in, restart persistence and explicit reset | Synthetic local records; no hosted credentials required |
| Native database/engine | PostGIS spatial acceptance, restoration of 100,000 indexed features, isolated processing, bounded imports and private worker cleanup passed | Real PostgreSQL/PostGIS and isolated native workers |
| Code scanning | Mandatory Semgrep security analysis passed: 160 rules across 770 files, zero findings | Pinned scanner/rules; findings and parse errors block CI; hosted CodeQL is unavailable for this private personal repository |
| Secret scan | Passed: 6,069 unique historical file versions across 852 reachable commits; deleted-credential self-test passed | Every reachable Git blob, including deleted and merged versions |
| Branch protection | All thirteen original required checks passed and remain configured, with strict up-to-date enforcement | Verified for the code revision above; any later commit must satisfy the same checks before merge |

Generated coverage, traces and test output remain in ignored directories or CI
artifacts. The public archived source replay fixture is committed; optional
private exports are not required for a fresh clone. Recovery screenshots use
an explicitly synthetic render failure and isolated storage, with provenance
recorded alongside the unchanged captures.

### Review, release and reassessment handoff

The documentation-only revision `2eef08f` later completed its checks with two
browser failures in [run 39550822338](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39550822338).
The polygon trace captured a drag projected before the canvas resized after
closing the layer pane; the test now uses the existing map-layout wait before
projecting the handle. The compact-roof WebKit case timed out during a pointer
move and passed three unchanged focused repeats; its original cause remains
unproven. The failed traces are retained as workflow artifacts. A subsequent
protected preview audit verified application health and anonymous denial, then
encountered Vercel's protection redirect on a package path. The package auditor
now uses the existing bounded asset-request helper, which retries temporary
protection propagation and rejects credential forwarding to external origins.
The next unit run exposed a gallery assertion made after IndexedDB deletion but
before React rendered the empty state. That test now awaits the selected remaining
image and visible empty state while retaining both storage-deletion assertions.
The final local-stack reset run then exposed an unhandled closed input pipe in
the development command helper. Commands without input now use a closed input
stream; supplied-input failures are handled and still fail the command. Regression
tests cover fast commands, complete input delivery, redacted exit failures and
early pipe closure, including a child that otherwise exits successfully.
The current PR
must pass the complete protected suite again before merge; the earlier passing
code receipt above does not override a later failure. See [production tracking](PRODUCTION.md#repository-readiness-application-update--21-october-2026)
for the package baseline and deployment procedure.

1. Review the pull request and its exact-revision checks independently. Preserve
   the existing branch protection, review/campus isolation and source rights.
2. After approval, follow [deployment](DEPLOYMENT.md) and [acceptance](ACCEPTANCE.md).
   Rebuild the locked workers and deploy matching API/UI code; this update needs
   no database migration. Retain immutable public packages and original receipts.
3. Record actual release, device/field and multi-user checks separately from
   automated fixture tests. This implementation does not claim those checks ran.
4. Submit the reviewed revision to DataFactor and compare its new assessment
   with the category mapping above. Keep its returned score and evidence with
   that revision; no score, additional contributor or independent review is invented.
