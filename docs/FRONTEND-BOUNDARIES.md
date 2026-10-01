# Frontend module boundaries and complexity budgets

This document defines ownership-oriented boundaries and file complexity caps for `web/src`.

## Boundaries

- **Public map flow**: search, destination details, route preview, navigation, public controls.
  - Primary files: `App.tsx`, `MapView.tsx`, `RoutePanel.tsx`, `PlaceInformation.tsx`.
- **Owner/editor flow**: editor workspaces, conflict/review controls, editing tools.
  - Primary files: `Admin.tsx`, `CampusWorkspace.tsx`, `LayerWorkspace.tsx`.
- **Import/release flow**: import preview, process monitor, release-impact and status surfaces.
  - Primary files: `ImportMapPreview.tsx`, `ProcessMonitor.tsx`, `release-impact.ts`.
- **Model/photo workflows**: model editing, photo editing, authoring/recovery surfaces.
  - Primary files: `PhotoModelWorkspace.tsx`, `PhotoManager.tsx`, `model-*`, `photo-*`.

Cross-boundary changes should keep interfaces explicit and avoid importing editor-only modules into public startup paths.

## Complexity budgets

Complexity budgets are enforced by `npm run check:complexity`.

- `web/src/App.tsx` <= 2100 lines
- `web/src/Admin.tsx` <= 3400 lines
- `web/src/MapView.tsx` <= 1600 lines
- `web/src/CampusWorkspace.tsx` <= 1600 lines
- `web/src/PhotoModelWorkspace.tsx` <= 3800 lines

Budgets are ceilings, not targets. New feature work should reduce central-file growth by extracting cohesive modules.

## Refactor priorities

1. Extract public map orchestration concerns from `App.tsx`.
2. Split owner workflow routing/control sections from `Admin.tsx`.
3. Isolate map rendering control adapters from `MapView.tsx`.
4. Separate photo/model workflow coordination from rendering/editor primitives.

## Change management

When altering boundaries or budgets:

1. Update this file.
2. Update `web/complexity-budgets.json`.
3. Update `/docs/ARCHITECTURE.md` if ownership or runtime boundaries changed.
