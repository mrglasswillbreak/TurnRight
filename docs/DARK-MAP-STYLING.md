# Reference-inspired dark campus map

The public map and editor share a slate-blue dark palette inspired by the supplied map screenshots. Existing light/dark/system preferences and Enhanced/Simple preferences remain in place. The application styles the campus's recorded geometry; it does not add roads, connections, heights, street furniture or geographical claims.

## Presentation

`map-classification.ts` derives display-only land and path properties. Waterbody spelling and whitespace variants resolve to water; wetlands, vegetation, bare land and developed ground have separate colours. Recorded highway, service and surface tags distinguish streets, service roads, parking aisles, pedestrian paths and unpaved surfaces. Access and routing remain independent of this classification. Empty names and generic Campus path labels are suppressed.

`map-theme.ts` applies one set of paints to initial map loading, theme changes and editor overlays. It remembers themed layer instances, so zoom and selection updates do not replay unchanged paints or symbol layouts; new or replaced layers still receive the current theme. `map-palette.ts` grades illustrative footprints and Simple extrusions into slate tones while preserving small hue differences. The browser does not write display colours back into appearances or model packages. Inspector swatches continue showing saved colours.

Enhanced models retain their original wall, window, roof and trim material colours in both themes, including legacy packages without surface metadata, simplified model LODs and draft previews. Dark mode uses neutral, lower-intensity lighting to shade the architecture without tinting it blue. Materials remain shared by original colour and surface role. This adds no rendering passes or model triangles. Geometry buffers, sector integrity checks, zoom detail thresholds, opacity, model picking and recovery continue to use the existing renderer.

Public Settings and Editor Settings share the same Appearance control: Device, Light and Dark. They use the existing single application appearance store and persistence, including cross-tab updates and a session-only fallback when storage fails. Changing appearance keeps the map, camera, drawing session and unfinished roof mounted.

Place badges are small vector symbols drawn once into MapLibre's image atlas. They require no remote sprite requests and no per-place DOM elements. Dark labels use category colours and halos; icon and text placement share MapLibre collision handling. Secondary places appear at closer zooms. Selected destinations retain priority. Light mode retains its dots and neutral labels.

Floating map controls use blue surfaces with subtle transparency. Blur is limited to these controls, with an opaque fallback and reduced-transparency support. Visible buttons have at least 44px touch targets. Panels retain their existing layout and semantic colours; tips and errors retain opaque, contrast-tested backgrounds.

## Acceptance

The `slate map` browser cases capture public/editor desktop/phone views at campus, neighbourhood and building scales in all three rendering modes. They check theme changes preserve the mounted canvas and camera, require no save, and keep controls accessible. A separate badge case exercises map picking and real street-name labels. Existing coverage checks zoom detail recovery, dark/light UI contrast, grouped undo, unfinished drawings, custom roof recovery, opacity, saved preferences and offline model integrity.

Before/after renderer timing is recorded as the `renderer-performance` attachment in the enhanced zoom cases. These cases also inspect actual WebGL diffuse uniforms in light and dark themes against the source wall, roof, window and trim colours, covering both current and legacy meshes. Timings exclude colour-inspection frames and use the same software-WebGL fixture and actual Three.js draw calls and indices. They are a regression comparison, not a physical-device frame-rate claim.

Application deployment preserves the owner's current published campus manifest and assets. Campus drafts remain under the owner's reviewed publication workflow. Physical Android and iPhone touch, pinch-zoom and offline reopening checks remain separate release acceptance items.

Validation on 15 September 2026: 302 unit tests, client/server type checks, production/PWA build and the visual budget check passed. Lint reports only the seven existing `any` warnings. The lazy 3D renderer is 119.8 KB gzip within the 300 KB budget. Eighteen Chromium acceptance cases, four WebKit phone cases and three production-service-worker offline cases passed; the final zoom and badge checks also passed after theme-update optimization. Captures cover all three rendering modes and map scales, with separate roof, route/UI readability and offline checks.

The public renderer fixture used eight draw calls and 1,884 indices both before and after. Median render time was 0.5 ms in both runs; measured p95 was 5.9 ms before and 3.5 ms after. An intermediate run had a noisier tail under concurrent machine load. These software-renderer measurements should not be interpreted as a guaranteed physical-phone speedup.

Reproduce the browser checks with the `slate map`, `enhanced zoom restores`, `readable interface`, `view settings`, `roof proposal draft`, `roof batch desktop`, `field typing is one undo` and `drawing session protects` selectors. Use `playwright.webkit.config.ts` for the phone checks, and `playwright.pwa.config.ts` with `prepared public map|prepared building editor` for offline acceptance.
