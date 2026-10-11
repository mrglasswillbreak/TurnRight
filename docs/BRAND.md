# TurnRight identity

TurnRight’s selected **B2** mark combines a bold blue right-turn route with a graduation cap on a slate tile. The route identifies navigation; the cap signals school campuses. The clean background keeps the arrow prominent at small sizes. The name remains **TurnRight** with a capital T and R.

![TurnRight horizontal wordmark](assets/brand/wordmark.svg)

## Assets

| Asset | Use |
| --- | --- |
| [Symbol](assets/brand/symbol.svg) | App and product identification |
| [Monochrome symbol](assets/brand/symbol-mono.svg) | One-colour reproduction |
| [Reversed symbol](assets/brand/symbol-reversed.svg) | Dark or forest backgrounds |
| [Wordmark](assets/brand/wordmark.svg) / [monochrome](assets/brand/wordmark-mono.svg) / [reversed](assets/brand/wordmark-reversed.svg) | Documentation and wider headers |
| `web/public/favicon.svg`, `icon-16.png`, `icon-32.png` | Browser icons |
| `web/public/apple-touch-icon.png` | 180 px Apple touch icon |
| `web/public/icon-192.png`, `icon-512.png` | Standard PWA icons |
| `web/public/icon-maskable-192.png`, `icon-maskable-512.png` | Full-background maskable PWA icons |

The editable source is `web/src/BrandMark.tsx` and `web/scripts/brand-assets.mjs`. Regenerate assets with `node scripts/brand-assets.mjs` from `web/`. Wordmark text remains editable SVG text, using Inter with an Arial fallback. The app uses the same reusable BrandMark in public, editor and authentication views.

The [11 October 2026 mobile capture](assets/brand/b2-public-mobile-2026-10-11.png) shows B2 in the local public app. It is an unaltered Chromium screenshot of the checked-in campus data, with [capture and asset verification records](assets/brand/b2-capture-2026-10-11.json).

## Usage

Use slate **#202A36** for the tile, route blue **#72BAFF**, and sky blue **#A4D5FF** for the arrow and cap. Use ink **#172C25** for text on light surfaces and white on dark surfaces. Forest green remains the interface accent. Leave at least one stroke-width of clear space around the symbol. Use the symbol without the wordmark at 16–32 px; the arrow carries the identity at the smallest size and the cap is a secondary detail. Keep the original proportions and orientation; do not add shadows to the path, stretch it, or replace the arrow or cap with generic icons. The app tile background may have platform-specific corner treatment. The route, arrow and cap fit inside the central safe circle with a radius of 40% of the icon width. Maskable and Apple touch icons use a full slate background so the platform can apply its own shape. Monochrome variants retain the route, arrow and cap in one ink without a tile background.

Map-data colours retain their existing meaning: branding must not recolour validation issues, draft highlights, routes or thematic datasets. Verify light/dark contrast and the 16/32 px raster previews whenever changing the path. These assets are original repository artwork; this document does not add a software or data licence. Consult [attribution](../data/ATTRIBUTION.md) for source-data rights.
