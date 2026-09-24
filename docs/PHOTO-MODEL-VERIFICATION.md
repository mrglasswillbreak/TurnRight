# Photo model and globe verification · 24 September 2026

The release candidate starts from `lasu-8577d5c85d2c` (395 buildings, 220 places, 39 photographs). The [coverage report](PHOTO-MODEL-COVERAGE.md) accounts for all 19 photographed buildings and every source image. It contains illustrative comparisons, not registered photogrammetric reconstructions. No footprint, entrance, access approval or route is added by these appearance proposals.

## Published release

Application commit `c6192a0` deployed successfully before the owner applied the reviewed batch. Baseline reconciliation retained all 129 correction records and the Law driveway / Library gate access reviews. Release impact showed exactly 19 changed buildings, no additions or deletions, and no newly disconnected destinations. Clinic–Senate remained 1,036 m, Clinic–Law 430 m and Clinic–Library 874 m. The 23 existing excluded-cross-building segment warnings remain unchanged.

The [immutable preview build](https://github.com/mrglasswillbreak/TurnRight/actions/runs/35948816101) passed, and its complete 39-photo download verified in the signed-in browser before publication. The [publication workflow](https://github.com/mrglasswillbreak/TurnRight/actions/runs/35949342795) completed successfully at 02:58 UTC on 24 September. The live version is **`lasu-313d8a168635`**, package schema 2, **84 assets / 18,880,327 bytes**. All 84 live assets subsequently passed byte-count and SHA-256 checks; all 345 deployed globe assets passed independently.

The live campus SHA-256 is `b2927184603beeeefdbb96bc42d4460e46f05ec3a8f58f8238a70b383201954c`. Comparison with the pinned baseline confirmed unchanged routing graph, places, entrances, driving metadata, closures, access rules, photographs, aliases, boundary, feature identities and every footprint. Exactly the 19 inventoried buildings changed properties. The published model revision is `7800b61507856525`, with 9,084,537 geometry bytes and zero approved wall textures. The owner workspace shows **0 unpublished corrections · Saved**.

The deployed inspector was also checked: photograph thumbnails and **Manage photos** appear immediately below the building heading, before Name and appearance controls. Final visual review prompted a small follow-up to wrap long evidence URLs and use the existing theme-aware muted text colour; the production build and budgets passed again after that CSS change.

## Automated checks

- Full Vitest suite: 478 tests in 62 files passed, including the added wide-glazing, close-detail and entrance-photo provenance regressions.
- TypeScript app and server checks passed. Oxlint passed with seven existing `no-explicit-any` warnings.
- Python importer suite: 23 tests passed; importer code is unchanged.
- Production build passed visual, voice, world and application bundle budgets. The renderer and guided editor, including shared dependencies outside startup, total about 132 KiB gzip against 300 KiB. Public startup is about 409 KiB against 425 KiB; editor about 127 KiB against 185 KiB; photo manager about 7.4 KiB against 12 KiB.
- All eight new browser journeys passed at 320, 390, 768 and 1440 pixels in both themes: photo loading, wall selection, editing, retained model canvas during text entry, no horizontal overflow, atomic save and focus restoration.
- Both 2D and 3D entrance drawing/save/reload journeys passed. A point-completion race was fixed so the trailing pointer click cannot select the building beneath a newly drawn entrance. The 3D fixture pans its ground target out from behind the drawing toolbar.
- The broad browser run exercised walking, driving, navigation, photo management, editor recovery, model fallbacks and WebGL recovery. Its initial failures were rerun after correcting stale fixture selectors, camera-animation assumptions and the entrance race; affected journeys then passed. Platform-only skips are not physical-device coverage.
- Optional-texture tests verify manifest credits, immutable bytes, malformed geometry/UVs, stale wall assignments, revision isolation, shared queue/residency limits, resource release and corruption preserving the active package. Photo edits and topology changes flag relevant façade evidence without granting routing permission.

## Offline checks

All **nine production PWA journeys passed**: schema-1/schema-3 photographs and entrance selection, driving voice, survey cold start/recovery/sync, public 3D preferences, enhanced-model corruption/repair/offline reload, backend-failure recovery, saved building/roof editing and enriched business details. Service-worker installation verifies all 345 world assets before activation; git-blob hashes for all four GeoJSON files match the manifest, including Linux checkout bytes. Existing package schemas 1–3 remain supported. Campus updates still verify every required asset before activation and retain working packages after failure.

## Visual review and budgets

All 19 building comparison sheets were inspected. An inherited 2.1 m glazing cap initially prevented wide, photo-informed window ratios from rendering; explicit ratios now control the bay width while legacy models retain their original cap. Existing owner roof plans and palettes remain. Fine repeated frame relief waits for close zoom or selection, retaining flat openings at campus scale. The polar visual check exposed MapLibre stretching the final raster row to the pole; plain generalised caps beyond 85° now mask that artifact. [MapLibre globe implementation](https://github.com/maplibre/maplibre-gl-js/blob/main/developer-guides/globe.md). Roof structures, doors, columns and photographic texture crops with uncertain wall correspondence remain review gaps.

The final candidate contains 57 detailed models, three simplified models and 335 source extrusions. Geometry is **9,084,537 bytes (8.66 MiB)** in 23 sectors. Zero photographic wall textures are approved in this initial candidate. The globe is **5.30 MiB**, so the combined visual allocation is about **13.96 MiB**, within the selected 20 MiB allowance. Texture residency is independently limited to 64 MiB, including mipmaps, with three shared concurrent texture jobs.

## Production measurements

| p95 measurement | Previous visuals | Updated visuals |
|---|---:|---:|
| Globe frame interval | 366.7 ms | 549.9 ms |
| Campus frame interval | 350.0 ms | 483.3 ms |
| Guided editor input → next paint, normal CPU | — | 6.6 ms |
| Guided editor input → next paint, 4× CPU | — | 21.8 ms |

The editor meets the 100/200 ms input targets in this harness with zero observed input-phase long tasks. All ten editor closures left only the underlying fixture canvas, with no dialog canvas retained. Map trials made 22 resource requests for the baseline and 26–27 for the update (the first updated trial also includes polar diagnostic captures). **Software-GPU map movement is slow and regresses with the richer visuals**; these results do not meet a smooth-frame standard. Limiting frame relief to close views reduced the earlier updated-campus result from 766.7 ms to 483.3 ms, although warm-up was also extended so this is not an isolated causal comparison. Simple 3D and existing automatic detail reduction remain available; real-device hardware performance still needs validation.

Raw five-run measurements are in [photo-model-performance.json](photo-model-performance.json). The fixture uses the verified campus snapshot, real MapLibre/Three rendering, Chromium headless and SwiftShader on Windows. Baseline map trials use the previous model catalogue and old vector overview in the same application. Timing is illustrative of this software-rendered environment, not a physical-phone guarantee. Map trials are accepted only with a visible, correctly sized canvas; an initial zero-height fixture trial was discarded.

Each editor run enters 30 characters with network completion excluded, at normal CPU speed and 4× throttling. Closing the dialog must leave only the underlying comparison fixture's single canvas. There are no approved photographic textures in this data, so measured residency is zero; synthetic pool tests cover bounded loading and disposal of textures.

Unavailable coverage: physical Android/iPhone hardware, device thermal/memory pressure, measured building dimensions, surveyed photo camera bearings, and a human screen-reader session. Keyboard, focus, semantic labels, narrow-layout and offline behavior have automated coverage. No claim is made that the illustrations reproduce unseen sides or that the photographs establish entrances or access permission.
