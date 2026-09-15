# Editable campus roof plans

The September 15, 2026 roof pass assessed all 380 published building footprints. After reviewing Law Clinic's separate-wing correction, it proposes **46 wing roofs across 44 buildings**: three buildings with photo-supported pitched forms (Law Clinic, School of Transport and Faculty of Education 3 In 1), plus 41 clearly labelled illustrative hip roofs. All generated ridge positions and pitches are approximate. Known flat/parapet silhouettes, explicit owner roof choices, existing custom roofs, unresolved competing models and unknown heights are retained. See [the full coverage list](BUILDING-ROOF-COVERAGE.md).

Law Clinic's geometry prerequisite regroups the existing coordinates into two exterior wings. It does not move vertices or change its identity or entrance associations. The auxiliary wing retains its visible palette and explicitly illustrative 6 m height. Its roof is not presented as a surveyed reconstruction.

## Editing

- Sources → Building roofs previews individual wing outlines, ridge plans, eaves and peak elevations, source links and uncertainty. The batch is explicit, validated, autosaved and one undo step. Opening the review makes no saved edit. The plans are calculated only after opening the section.
- Selecting a wing in Roof mode offers **Preview approximate hip roof**. This starts an unfinished roof draft; **Apply roof** commits it. Settings, 2D/3D switching and recovery retain the unfinished plan.
- The generator stores ordinary editable roof points, elevations and ridge constraints. It uses the existing constrained triangulation to keep concave footprints and courtyards intact. Four-sided wings receive a simple hip ridge; complex wings use interior triangle connections. These are illustrative ridge networks, not a surveyed roof plan or an exact straight skeleton.
- Eaves and peaks remain inside the existing total height. Invalid outlines, incompatible constraints, zero-area geometry and model/control-point budget failures block the proposal. Source geometry and routing are unchanged by the roof batch.

## Generation and validation

The editor and immutable release use the same custom-roof mesher. A custom roof no longer triggers the obsolete complex-pitched-roof downgrade, which hid facade windows during publication. Roof evidence notes travel with recovery and the published catalogue.

Candidate verification: 57 enhanced models across 23 sectors, **938,421 bytes** of model sectors. Every candidate release model matches editor geometry and materials exactly. The 46 proposed wing roofs have nonzero slopes. The original public package had zero sloped enhanced roofs.

Automated coverage includes concave wings, courtyards, invalid ring grouping, invalid heights, point budgets, whole-wing movement, preserved owner styles and roofs, reference mismatches, single-step batch undo/redo, recovery, and editor/release geometry parity. Chromium desktop/phone checks cover review, saving, reload and dark-mode readability; Chromium also covers unfinished roof recovery through Settings and view changes and full-campus regeneration. WebKit phone checks cover review, save, undo/redo and reload. Physical Android/iPhone touch and offline acceptance remain outstanding.

The application update may be deployed independently. Campus roof changes remain in the owner's reviewed draft/release workflow; public publication requires the owner's Publish action.
