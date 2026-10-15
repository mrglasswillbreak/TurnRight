# Data and source evidence

This directory contains attributed inputs, source research, reproducible seed data, and dated verification evidence. Read [ATTRIBUTION.md](ATTRIBUTION.md) before redistributing data. Public availability of a source is not a licence grant.

| Path                                                            | Purpose                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `seed/`                                                         | Development campus input; not a claim about the current production catalogue                                        |
| `licenses/`                                                     | Retained third-party licence terms                                                                                  |
| `photos/`                                                       | Photograph catalogue and source/rights records; see [photo provenance](photos/README.md)                            |
| `visuals/`, `photo-models/`                                     | Model/reference research and preparation evidence                                                                   |
| `enrichment/`, `campus-layer-enrichment/`, `unilag-enrichment/` | Dated proposals, source comparisons and campus-specific evidence                                                    |
| `audio/`, `voice/`                                              | Guidance-generation inputs and voice records                                                                        |
| Root JSON/GeoJSON records                                       | Source configuration, coverage, lineage and dated release/data checks; consumers reference these filenames directly |
| `raw/`, `candidates/`, release scratch inputs                   | Ignored downloads and local preparation; keep private inputs out of public assets                                   |

Runtime packages live under `web/public/` and are generated/verified by the packaging and release tools. Do not hand-edit package hashes or remove historical compatibility fixtures to make a check pass. Private exports, user identities, locations, uploads, and backup keys do not belong in versioned evidence.

[Import workflow](../docs/CAMPUS-IMPORTS.md) · [Source review](../docs/SOURCE-UPDATES.md) · [Repository conventions](../docs/REPOSITORY.md).
