# Building reference research · 14 September 2026

> Dated LASU research record. Source observations and original package counts are preserved; use [Model authoring](MODEL-AUTHORING.md) for current tools and [Production](PRODUCTION.md) for the current release.

This pass inventories every building in the published `lasu-5cff24fd045f` package (380 footprints) and proposes appearance edits against the editor's current data. Geometry, entrances, roads and source identities are retained. Application deployment makes the proposals available; the owner's reviewed campus release publishes applied drafts.

## Sources and matching

The [Commons campus collection](https://commons.wikimedia.org/wiki/Category:Lagos_State_University) and its individual credited files provide dated facade photographs. The existing 37-image research collection was checked against the evidence register; the new Theatre Arts and Music photograph and Makanjuola venue photograph were also visually inspected. Photos are research references, not bundled textures. Credits, dates and licensing remain in `data/building-evidence.json`.

New matched references:

- [Department of Theatre Arts and Music](https://commons.wikimedia.org/wiki/File:Department_of_Theater_Art_and_Music,_Lagos_State_University.jpg): named facade, two visible levels, ochre walls, dark openings and brown-red framing. Floor-derived height remains approximate.
- [Postgraduate School](https://commons.wikimedia.org/wiki/File:Post-graduate_school,_LASU.jpg): named entrance, cream walls, brown-red accents and a mostly solid side wall. Repeated windows stay off; the roof behind its sculptural parapet is unresolved.
- [Makanjuola Lecture Theatre, official LASU venue page](https://lasu.edu.ng/prefasugamesseminar/) and [PWDC architect's project](https://www.world-architects.com/en/pwdc-patrickwaheed-design-consultancy-lagos/project/aderemi-makanjuola-lecture-theatre): grey exterior, narrow dark openings and blue entrance portals. The architect dates the 500-seat project to 2018. Window bands are not evidence of occupied floor count; source height is retained. Portals need individual wall evidence before modelling.

Existing matched references for Senate, International Library, Law Library, Law Clinic, Mass Communication, Education, MBA, Transport, Student Arcade and Radio now supply explicit facade palettes. Solid arcade panels do not receive a generic window grid. Compound roof ridges remain unresolved; this pass does not invent custom roofs.

Matching requires the stable building ID and a recorded footprint revision. An outline that changed since the assessment is held for reassociation. Colours are approximate visual interpretations under photographic lighting. Spacing, trim and hidden elevations are illustrative.

## Search coverage and unresolved evidence

Searches covered the campus collection, named faculties (Law, Management Sciences, Social Sciences, Education, Arts and Science), laboratories, ICT/CBT/ACE facilities, health facilities, libraries, auditoria, staff housing, student facilities, banks and the International School. Source floor/height records and footprint dimensions were assessed for all mapped buildings, including unnamed footprints. This does **not** mean a photograph was found for every building.

- The [official Health Centre](https://healthcenter.lasu.edu.ng/) describes services across campus facilities, but does not securely associate an exterior photograph with each mapped medical block. Law Clinic photos cannot be reused for the medical Clinic.
- The [official ICT centre](https://lasu.edu.ng/home/ictc/) establishes the institution's role, without resolving each ICT/Zenith/CBT footprint's exterior.
- The [2022 institutional report](https://ibiyemiolatunjibello.com/wp-content/uploads/2022/09/365-single-pages.pdf) and [staff-housing allocation record](https://lasu.edu.ng/home/downloadables/Allocation%20Form%20_1584380747.pdf) contain contextual information, but do not establish block-by-block facade assignments or measured heights. No appearance is copied between housing blocks on this basis.
- The [2022 virtual-tour announcement](https://www.lasu-info.com/2022/03/lasu-virtual-campus-tour.html) points to `lasuvirtualtour.online`; that tour could not be opened during this pass and was not used as visual evidence.
- Abisogun Leigh, Enitan Bababunmi, the older main library, printing press and sports hall have photographs but unresolved footprint associations. Existing unresolved references remain in the evidence register.
- Search results for LASUED, LASUSTECH, Epe, Ikeja and unrelated universities were excluded. The large mapped Sports Center outline must not be treated as the roof of the photographed sports hall.

Buildings with supported source heights receive an optional illustrative facade proposal. Unknown-height buildings, unresolved competing models, construction sites, and invalid wing outlines retain their existing treatment. Each is listed with its reason in the generated coverage report and editor review. No changes are made merely by opening the review.

## Applying and publishing

Open **Sources → Building appearances** to inspect proposed values and source links. Existing explicit appearance fields, wing/wall overrides and custom roofs take precedence. Apply the reviewed batch as one undoable operation, let autosave finish, then prepare and inspect the normal release preview. The editor and release use the same generated geometry from the applied properties. Physical Android/iPhone acceptance remains outstanding.

## Verification

The published 380-building input yields 53 proposals: 11 photo references and 42 illustrative facades. The reviewed candidate generates 56 models (49 detailed, 7 simplified) in 22 sectors, using 803,620 bytes of the 12 MB model budget. Direct generation comparison found no geometry or material differences between the editor and release for all 56 models. The candidate retains the original graph, entrances and footprint geometries. See [all-building coverage](BUILDING-APPEARANCE-COVERAGE.md).

282 unit tests passed, including proposal immutability, geometry association, preservation of custom surfaces/private evidence, explicit unknown heights, unmeasured auxiliary-wing appearance, one-step undo/redo, unchanged routing, and release-asset preservation. Client/server type checks and production build/budget checks passed. Browser acceptance passed on desktop and phone Chromium and phone WebKit. A full-campus browser fixture with accepted wing repairs applied 57 appearances and regenerated the enhanced models without preview errors. That fixture's count differs from the current published campus because its geometry repairs have already been accepted.

The live owner draft offered 54 updates (12 photo references and 42 illustrative facades), including its previously repaired Senate footprint. That batch was applied and autosave confirmed. Release impact showed zero newly disconnected destinations and unchanged Clinic–Senate, Clinic–Law and Clinic–Library routes. The first immutable preview generated 57 models in 23 sectors (849,813 bytes), then exposed an existing release failure: an old deployment URL returned HTML when preserving published assets. Release builds now use the verified public origin, pin the baseline version, and report invalid manifest responses clearly. Tests cover version changes, HTML responses, corrupt assets and preserving the candidate manifest.

Reproduce the candidate from a saved public snapshot in `web`:

```powershell
node --import tsx scripts/prepare-building-appearances.ts path/to/campus.json ../data/candidates/reference-appearances
node --import tsx scripts/build-campus-visuals.ts ../data/candidates/reference-appearances/campus.json ../data/candidates/reference-appearances/visuals --reviewed
```

Preparing a candidate does not write to the editor or publish campus data. The live editor recomputes proposals against the current owner draft and checks for changes again before applying them.

## Deployed owner review

The [successful release workflow](https://github.com/mrglasswillbreak/TurnRight/actions/runs/34898387490) built [the exact appearance preview](https://turnright-94esd65jc-muhammed-abdulhadi-s-projects.vercel.app), version `lasu-4e5df8b7df07`, from the saved owner draft. The owner browser displayed its enhanced facades without console errors and enabled the reviewed Publish action. The preview uploader explicitly includes the public reference catalogue and enables imports outside the `web` root; raw imports and draft snapshots remain excluded from source upload. The application updates are deployed, while the public campus remains `lasu-5cff24fd045f` until the owner publishes the reviewed preview.
