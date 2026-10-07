# TurnRight identity

TurnRight’s mark adapts the public map’s offline tile: a slate street grid, a bright blue turning route and a navigation arrow at its endpoint. The simplified arrow and strong route remain readable at small sizes. The name remains **TurnRight** with a capital T and R.

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
| `web/public/icon-maskable-192.png`, `icon-maskable-512.png` | Separately padded maskable PWA icons |

The editable source is `web/src/BrandMark.tsx` and `web/scripts/brand-assets.mjs`. Regenerate assets with `node scripts/brand-assets.mjs` from `web/`. Wordmark text remains editable SVG text, using Inter with an Arial fallback. The app uses the same reusable BrandMark in public, editor and authentication views.

## Usage

Use slate **#202A36** for the tile, streets **#43535E**, route **#72BAFF** and arrow **#A4D5FF**. Use ink **#172C25** for text on light surfaces and white on dark surfaces. Forest green remains the interface accent. Leave at least one stroke-width of clear space around the symbol. Use the symbol without the wordmark at 16–32 px. Keep the original proportions and orientation; do not add shadows to the path, stretch it, or replace the arrow with a generic icon. The app tile background may have platform-specific corner treatment. Maskable artwork places the entire tile inside the central safe area. Monochrome variants simplify the grid to a tile outline, route and arrow so they reproduce in one ink.

Map-data colours retain their existing meaning: branding must not recolour validation issues, draft highlights, routes or thematic datasets. Verify light/dark contrast and the 16/32 px raster previews whenever changing the path. These assets are original repository artwork; this document does not add a software or data licence. Consult [attribution](../data/ATTRIBUTION.md) for source-data rights.
