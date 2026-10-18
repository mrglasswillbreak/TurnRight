# Licensing readiness reconciliation

The unfinished `feat/bounded-import-queue` checkout at
`23d6cf114dbcf59f3fdc561ad6bc291e0db38ed3` was preserved before switching branches.
A ZIP contains every tracked/untracked pending file and a deletion manifest;
every stored file was checked against its SHA-256 and the archive integrity check
passed. A second recovery copy remains in Git stash with the label
`licensing-readiness: verified unfinished checkout snapshot`. Ignored private
backups, credentials and research output were left in place.

The ZIP is ignored at `web/work/licensing-readiness/unfinished-checkout.zip`.
Its SHA-256 is `6e0085a326798d204822bc64d7b045825fb21ef3f15b3db5b3b1e3ca02a54ef6`.
Do not publish that archive: the committed record contains only path dispositions.

The new `feat/licensing-readiness` branch starts at refreshed `origin/main`
`17f758277bda9d4c2e85658aa6858a2d24dc9b24`. Comparison expanded status directories
into 338 paths and normalized CRLF/LF for content comparison:

| Disposition | Paths | Treatment |
| --- | ---: | --- |
| Already in main | 229 | Keep main; 203 were also byte-identical before newline normalization. |
| Deletions already in main | 63 | Keep the deletions. |
| Exact prior versions in main history | 29 | Keep the newer main version. |
| Individually reviewed, superseded | 14 | Keep current production receipts, migrations 001–056 and browser readiness fixes. |
| Formatting only | 3 | Keep behavior; apply the shared formatter separately. |

No unique functional change remained to transplant. Existing mobile pane and
accepted-source review tests were already present at different positions in main.
Current publication recovery, campus isolation, landmark tests and newer screenshot
provenance remain intact. [Every path and its disposition](assets/licensing-reconciliation-2026-10-18.json)
are recorded separately from the new implementation commits.

## Coverage baseline

A pristine archive of the baseline revision was tested with Node 22.23.3,
Vitest/V8 5.0.0 and explicit first-party include patterns, before component
refactoring. A Linux remeasurement added the initially omitted `lib/` and `hooks/`
roots without modifying historical source or tests. All 117 test files passed:
856 tests passed and one optional test
requiring an ignored private source export was skipped, as on clean CI clones.
Application, component, server and API files are counted even when unimported.

| Metric | Baseline | Enforced whole-project floor |
| --- | ---: | ---: |
| Statements | 38.18% | 38% |
| Lines | 38.21% | 38% |
| Functions | 32.58% | 32% |
| Branches | 35.82% | 35% |

[Machine-readable baseline](assets/coverage-baseline-2026-10-18.json) records the
revision, totals and command. These are unit coverage figures; browser journeys
and native worker verification are reported separately. Newly introduced domain
modules have stricter 80% statement/line/function and 70% branch floors.
