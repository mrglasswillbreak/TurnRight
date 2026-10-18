# Software and asset rights

Original TurnRight software is proprietary, as recorded in [LICENSE](LICENSE).
Licensing evaluation is not a transfer of ownership or a public reuse licence.
Any commercial grant must identify the original software and the rights actually
held by its licensor. Git history and existing attribution remain intact; this
release does not rewrite authorship or relabel third-party work as original.

## Dependency inventory

The committed npm and Python locks identify exact dependency versions. Their
upstream licences and distributed notices remain applicable, including transitive
dependencies. The following direct application dependencies were checked against
the installed metadata from `web/package-lock.json` during readiness work:

| Dependencies | Declared licence |
| --- | --- |
| React, React DOM, Base UI, Supabase JS, clsx, Proj4, react-resizable-panels, tailwind-merge, Terra Draw and its MapLibre adapter, Three.js, tw-animate-css | MIT |
| MapLibre GL JS | BSD-3-Clause |
| Constrainautor, Delaunator, idb, Lucide React | ISC |
| class-variance-authority, Sharp | Apache-2.0 |
| JSTS | EDL-1.0 OR EPL-1.0 |
| Inter variable font | OFL-1.1 |

This is an inventory of declared terms, not a substitute for the full licence
texts or a claim that a software licence covers source data. Keep dependency
notices when distributing packaged code. Development tools, the Supabase stack,
PostgreSQL/PostGIS and the pinned GDAL images have independent upstream terms.
The separate voice-generation environment keeps its own lock and
[Kokoro notice](data/voice/KOKORO-LICENSE.txt).

## Data, media and historical evidence

[Data attribution](data/ATTRIBUTION.md) and per-package source/photo/model credits
identify asset provenance. Campus source permissions, OpenStreetMap terms,
photograph licences and model evidence must be evaluated for the exact asset;
public accessibility alone does not establish redistribution permission.

Vendored image codecs retain their licence files under
`web/public/photo-codecs/e8d35e0/`. Preserve those bytes and notices. Historical
fixtures and dated measurements retain their original scope and provenance;
they are not new field surveys or newly licensed assets. Private research archives,
credentials and unpublished source proposals are excluded from reassessment
deliverables. The local-stack fixtures are synthetic and independently generated
from the existing test fixture.
