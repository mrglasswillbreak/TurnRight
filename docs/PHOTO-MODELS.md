# Photographic building detail and offline globe

This release assesses **395 buildings and 39 published photographs covering 19 buildings** in `lasu-8577d5c85d2c`, checked on 24 September 2026. Stable IDs, owner colours, custom roofs, footprints and routing permissions are retained. Photo captions and GPS fixes do not change model revisions.

The 19 proposals add framed openings, photo-informed opening proportions and evidence notes. The Faculty of Management Sciences receives a three-floor estimate where its height was unknown; 9 m uses the existing 3 m/floor convention. Existing owner heights take precedence. Regular window positions and frame dimensions remain illustrative. Photographs do not establish unseen elevations, exact dimensions, usable entrances or permission to enter.

## Evidence and comparisons

The [inventory](../data/photo-models/inventory.json) records all 39 image hashes, public credits, source pages where provided, dates, historical flags, identity decisions and texture decisions. The [building report](PHOTO-MODEL-COVERAGE.md) links one comparison sheet and evidence gaps for each building. Neither includes private originals or reviewer account identities.

The images comprise 35 exterior evidence views, two interiors, one approach-only view and one rejected building match. `owner:219bff19-0911-4994-9e4b-1b88c02de40a` shows the campus gate although it is filed under the Main Auditorium. It is excluded from model observations; its gallery association needs a separate owner correction. Historical photographs stay labelled. Conflicting undated Law Clinic finishes do not override owner colours.

No image in this snapshot has an established camera bearing tied to a specific mapped wall. **No photographic wall textures are automatically approved in the initial candidate.** The editor and release pipeline support them after a wall and unobstructed crop are reviewed. Comparison views are illustrative, not registered photogrammetric comparisons. Unknown roof structure, atria and hidden sides remain recorded gaps.

## Owner workflow

Select a building and choose **Photo & model**. Desktop shows the photograph and model together; narrow screens have Photograph and Model tabs.

1. Select a photograph and a **Mapped wall**. The wall is outlined in blue. Rotate/zoom using view buttons, mouse or touch. Check the photo's historical label and credits.
2. Confirm the correspondence. Left-to-right placement follows the wall's original endpoints. Add windows, doors, columns, balconies, canopies, parapets or trim; set position, dimensions, projection and repetitions. Record visible evidence and estimated dimensions. Existing wing and roof tools remain in the building inspector.
3. For an unobstructed wall view, open **Photographic wall texture**. Choose four corners clockwise from top left using draggable markers or labelled coordinates. Exclude sky, people, vegetation and unrelated surfaces. Gallery originals remain unchanged. Unavailable textures retain a plain material.
4. Use **Before / After** to compare with the opening state. **Apply reviewed model details** saves one undoable map edit. Closing without Apply discards uncommitted controls; applied edits use normal draft recovery and release review.

Moving a footprint or moving/replacing a source photograph flags affected evidence. Removed wall assignments retain their recipes: rematch them explicitly or reset the details. Release validation blocks stale assignments. Caption and ordering changes preserve review.

Sources contains **Photo & model evidence · 19 buildings**. Review observations and gaps, exclude proposals as needed, and apply supported proposals as one undoable batch. Source-photo identity and SHA-256 must match; changed evidence is withheld. Proposals fill missing settings and preserve owner overrides.

## Globe sources

The globe uses the fixed **September 2004 NASA Blue Marble Next Generation shaded-topography composite**, at 21,600 × 10,800 source pixels (approximately **2 km per source pixel at the equator**). It is resampled to 8,192 × 4,096 and reprojected into 341 local 512-pixel WebP tiles for zooms 0–4. This is a dated global overview, not current campus imagery. Relief is baked in; there are no global terrain meshes, animated clouds or automatic rotation.

Credit: NASA Earth Observatory, Blue Marble Next Generation. [Original imagery](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/) · [NASA media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/). The image is reprojected, resampled and compressed; no NASA affiliation or endorsement is implied. Natural Earth v5.1.2 supplies 1:50m countries/coastlines, lakes and selected populated places under its [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/). Original label spelling is retained in `sourceName` when display labels require transliteration for bundled glyphs.

[Source URLs, hashes and retrieval dates](../data/world-sources.json) and the [derived asset manifest](../web/public/world/manifest.json) make the build reproducible. Ordinary builds require no source downloads. From `web`, run `node scripts/build-world.mjs`; use `--record-sources` only when deliberately reviewing changed source snapshots.

Imagery fades between zooms 5 and 8 into the vector overview. Labels have collision handling and theme-aware halos; the LASU marker and campus transition remain. MapLibre provides atmosphere. Raster tiles wrap at the antimeridian and use Web Mercator's latitude limit. Deliberately plain caps beyond 85° prevent the renderer stretching the last raster row into misleading polar detail; these caps are generalised fills, not photographic coverage.

## Rendering, offline delivery and compatibility

- Campus geometry plus textures: **12 MiB maximum**. The candidate has 57 detailed models, three simplified models and 335 source extrusions in 23 sectors, with no newly approved wall textures.
- Globe: **8 MiB maximum**, approximately **5.29 MiB** including its manifest. Both limits enforce the combined 20 MiB allowance.
- Texture residency: **64 MiB shared across map and guided preview**, reserving pixels and mipmaps before decoding. Three texture jobs run concurrently. Identical recipes share resources within a renderer; hidden detail releases textures. Simple 3D and automatic fallback remain available.
- Primitives are batched by material and detail level. Fine repeated window-frame relief appears at zoom 19 or on the selected building; flat openings remain visible at campus scale. Optional UVs and material recipes extend meshes. Detail revisions are separate from legacy geometry revisions; stale results are rejected. Closing views disposes workers and GPU resources.
- Derivatives are metadata-free 512 × 512 WebP, at most 250 KiB each, with immutable hash URLs, credit, licence links and crop/rectification/compression notices. Gallery assets remain unchanged.
- Textures use a separate optional manifest group. Sector declarations and schemas **1–3** are retained; older readers use colour geometry or extrusion fallback. **No database migration.**
- Every required campus asset is verified before activation. Interrupted or corrupt downloads retain the prior package. Corrupt active textures require repair while colour geometry remains usable. Globe assets are hash-verified during service-worker installation; failed installation preserves the working app. Guided editor chunks are precached for prepared offline installations.

## Reproduction

With Node 22, from `web`:

```sh
node scripts/fetch-photo-model-evidence.mjs
node --import tsx scripts/prepare-photo-model-candidate.mts path/to/verified-campus.json work/photo-model/candidate.json
node --import tsx scripts/build-campus-visuals.ts work/photo-model/candidate.json work/photo-model/visuals --reviewed
npm test
npm run lint
npm run build
npm run test:browser
npm run test:survey-pwa
```

Build the production fixture with `vite.performance.config.ts` and serve `work/performance-dist` on port 5195. `node scripts/benchmark-models.mjs --sheets` produces the 19 comparison sheets; running it without that flag records five before/after map trials and five editor trials each at normal and 4× CPU speed. It reads a verified snapshot and photographs from `work/photo-model`, never authenticating or writing to production. Baseline map trials use the previous catalogue and the 110m vector-only overview in the same application, isolating visual costs.

Measurements use Chromium/SwiftShader, not physical Android/iPhone hardware. The coverage report records results and unavailable coverage. Deploy compatible readers first, then inspect, accept and publish the reviewed draft through Releases. Keep the previous immutable deployment for rollback.
