# Contributing to TurnRight

TurnRight combines public campus navigation with an authenticated GIS editing and publication workflow. Start with the [project overview](README.md), [architecture](docs/ARCHITECTURE.md), and [editor layout contract](docs/EDITOR-LAYOUT.md).

## Local development

Use Node **22.23.3**, pinned in `.node-version`, and install dependencies with `npm ci` in `web/`. Run `npm run dev` for the public seed. Authenticated APIs require the configuration described in [deployment](docs/DEPLOYMENT.md); Vite alone does not serve the Vercel backend. Keep credentials in local environment files and use isolated accounts/fixtures for automated tests.

## Changes and review

1. Describe the user-visible problem and a reproducible example.
2. Make a focused change. Preserve map identity, recovery, unsaved input and undo when altering editor layout. Treat imports, approval and publication as separate steps.
3. Run the checks below and record any environment limitation. Add a regression test when behavior or data integrity changes.
4. Update the relevant guide and capture affected views using [screenshot maintenance](docs/SCREENSHOTS.md). Keep dated evidence and historical images intact.
5. In the pull request, explain the resulting behavior, validation, and any operational requirements. Do not include private map data, tokens, personal location histories or unlicensed photographs.

## Checks

```sh
cd web
npm test
npm run lint
npm run build
npm run check:configured-build
npm run test:browser
npm run test:survey-webkit
npm run test:survey-pwa
```

Build scripts enforce map, globe, voice and JavaScript bundle budgets. Use the pinned GIS worker container for native-driver acceptance; see [imports verification](docs/CAMPUS-IMPORTS.md#verification). Browser fixtures are not a substitute for physical-device or field validation. Format changed files with `npx oxfmt <files>` and validate documentation with `node scripts/check-docs.mjs`.

## Data and licensing

Retain source attribution, licence terms, provenance and access restrictions. Never infer public redistribution rights from an accessible URL. Publication requires the existing independent approval flow. Source and photograph licences are documented in [data attribution](data/ATTRIBUTION.md) and [photo records](data/photos/README.md). There is currently no root software LICENSE file; contributing does not imply an additional licence grant.
