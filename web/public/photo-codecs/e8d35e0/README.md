# Local image encoders

These unmodified, single-threaded WebAssembly encoders come from
[GoogleChromeLabs/Squoosh](https://github.com/GoogleChromeLabs/squoosh/tree/e8d35e0fb66eb16eff6fe8fc773eabcbb7128de3),
commit `e8d35e0fb66eb16eff6fe8fc773eabcbb7128de3`, retrieved 30 September 2026.
TurnRight adapts Squoosh's encoder defaults and comparison-workspace colours/layout.
It is an independent application; it is not endorsed by Squoosh or Google.

| Files | Upstream directory | Licence |
| --- | --- | --- |
| `webp_enc.*` | `codecs/webp/enc` | BSD, LICENSE-webp.txt |
| `mozjpeg_enc.*` | `codecs/mozjpeg/enc` | BSD/IJG/zlib, LICENSE-mozjpeg.txt |
| `squoosh_oxipng*` | `codecs/oxipng/pkg` | MIT, LICENSE-oxipng.txt |
| `avif_enc.*` | `codecs/avif/enc` | BSD, LICENSE-libavif.txt, LICENSE-aom.txt, PATENTS-aom.txt; libsharpyuv: LICENSE-webp.txt |

Squoosh's wrapper code is Copyright Google Inc., Apache-2.0 (LICENSE-SQUOOSH.txt).
The AVIF build pins libavif 1.0.1 and libaom 3.7.0 as specified in the upstream
Makefile. No remote image service is involved. The original source and build
instructions are in the linked repository.

The editor lazily downloads only the chosen encoder. “Prepare for offline use”
caches all four encoders (approximately 3.6 MB); these files are excluded from
public-map startup and the ordinary service-worker precache. Hashes in
`src/photo-codec-manifest.json` are checked before storing offline copies.
Update the versioned directory and manifest together when upgrading codecs.
