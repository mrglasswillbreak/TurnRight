# Readiness follow-up: 21 October 2026

DataFactor reassessed TurnRight at **65.1 (C)**, compared with **46 (D)** on 19 October. Its stated qualification threshold remains 70; compensation and suggested point gains are estimates, not promises.

| Category      | Previous | Reassessment |
| ------------- | -------- | ------------ |
| Cleanliness   | 25       | 68           |
| Architecture  | 45       | 62           |
| Testing       | 55       | 72           |
| Dependencies  | 45       | 58           |
| Documentation | 60       | 70           |
| CI            | 40       | 80           |
| Security      | 65       | 68           |
| History       | 45       | 35           |

## Changes and evidence

- Surface actual workspace dependencies, runnable commands, coverage scope and CI near the top of the root README. Move the existing enforced Oxlint/Oxfmt configurations to the root and use conventional `docker-compose.yml`. Root `requirements.txt` includes the existing hashed Python quality/test lock; native workers retain their separate locks.
- Generate the complete `.env.example` from the checked configuration inventory, marking provider/runtime/per-job entries as comments rather than global setup values. The inventory check now verifies the template too.
- Extract Python geometry, campus source reading/routing, conversion, normalization paths/results, GIS fields/export, ArcGIS review and UNILAG comparison into domain helpers. Preserve CLI entry points, existing assertions, original source identities and network isolation. Extend the fewer-than-500-lines gate to authored Python, including tests/tools. Include the extracted live GIS and monitoring helpers in processing coverage.
- Add private, bounded operational error tracking, authenticated owner visibility, grouped recurrence alerts, optimistic resolution and retention. [Monitoring](ERROR-MONITORING.md) documents setup, privacy and the shared-database outage limit.
- Expose `npm run test:python:isolated` as a local Linux/WSL2 equivalent of the mandatory no-network, no-skips native gate. Initial package/image installation still needs internet access.

The reassessment's missing Compose and Python-lock claims did not reflect the repository. Its “no runnable suite” recommendation conflicts with its CI description. Its 20-day history claim also differs from the actual 8 September–21 October span at the assessed 799-commit main revision. These discrepancies justify clearer evidence, not fabricated history or duplicated dependencies. [Quality map](QUALITY.md) identifies commands and authoritative files.

## Verification contract

Implementation and current validation/deployment status are tracked in [PR #58](https://github.com/mrglasswillbreak/TurnRight/pull/58). An open PR or a local passing test does not establish production deployment.

The preceding [release PR #47](https://github.com/mrglasswillbreak/TurnRight/pull/47) preserves the 1,009-test and combined-coverage measurements for its own revision. They are not measurements of this follow-up. The follow-up must pass root quality, full unit/component coverage, all required Chromium/WebKit and offline journeys, native processing coverage, local-stack acceptance, PostgreSQL monitoring acceptance and security checks before merge. The final PR/deployment receipt must identify its exact revision and live monitoring probe.

Production verification must preserve all 236 existing campus assets and verify both campuses and offline operation. Migration 057 is additive and operational only; deployment does not authorize new campus data publication. Keep historical evidence and original source/rights boundaries intact. Future external scores, sustained multi-author maintenance and independent review remain unclaimed.

## November retry

The 1 November retry started without a billing rejection. Security, native GIS and database acceptance, quality, the local stack, WebKit and offline checks passed on `5bb8971937e537f5dbbd19c429975a04ab97ae5c`. Chromium shard two recorded 50 passes and one timeout in the public-footprint editor handoff; combined coverage was consequently skipped. These results do not authorize deployment.

The retained trace shows the correct unlinked building in the editor's Properties panel while its lazy building tools are still loading. The test had started checking the model button before editor startup completed. The unchanged case passed once locally with coverage enabled, and related local repeats reproduced delays in the properties panel and building tools. The public building and sign-in return tests now reuse the fixture's real map-readiness wait after navigation, then verify the selected building's heading before checking its tools. Behavioral assertions and their ten-second timeouts remain intact. The repaired candidate must pass the complete protected suite and combined coverage before migration or deployment; exact results remain in PR #58 and its release receipt.

After the repair, all four focused handoff journeys passed twice locally with Chromium coverage enabled (eight passes). Root quality and documentation checks passed; current installation guides consistently require migrations 001–057. These focused results do not replace the full CI coverage gate or a verified production release.
