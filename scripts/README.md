# Data, processing, and release tooling

These programs run from the repository root unless a guide or workflow specifies otherwise. They are distinct from [web-specific tooling](../web/README.md) in `web/scripts/`.

| Area                                | Entry points                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Campus import                       | `import_map.py`, `import_campus.py`, `map_import/`                                                                                         |
| Upstream acquisition and enrichment | `check_map_sources.py`, `enrich_campus.py`, `download_overture.py`, campus-specific preparation scripts                                    |
| Local ArcGIS research              | `arcgis/TurnRight.pyt`, `arcgis/bridge.py`, `arcgis/create_project.py`, `arcgis/export_portable.py`, `arcgis/review_candidates.py`          |
| Source evidence and decisions       | `source-check-worker.mjs`, `source-comparison.mjs`, `source-verification.mjs`, `source-review-worker.mjs`, `source-review-maintenance.mjs` |
| Isolated GIS processing             | `gis-worker.mjs`, `gis/process.py`, `gis/Dockerfile`                                                                                       |
| Packaging and release               | `package.mjs`, `public-campus.mjs`, `release.mts`, `photo-release.mjs`, `verify-release-preview.mjs`                                       |
| Retention                           | `cleanup_imports.py`, `cleanup-preview-access.mjs`                                                                                         |
| Verification                        | `tests/`, `gis/check_database.py`, `gis/check_worker.mjs`                                                                                  |

Use Python **3.12** and the pinned requirement files. Native GDAL/PostGIS/GeoPackage checks run in the pinned Linux environments used by `.github/workflows/map-import-tests.yml` and `gis-acceptance.yml`. A local run with skipped native-driver tests is not equivalent to those gates.

```sh
python -m pip install -r scripts/requirements-data.txt
python -m unittest discover -s scripts/tests -v
```

Run mutating workers through their documented workflows with an explicit campus/job/run token. Historical campus preparation and deployment scripts are not general bootstrap commands. Inspect their scope before invoking them; keep service secrets in runner configuration. Never use a source refresh or documentation capture to publish map content.

The [ArcGIS toolbox and archive guide](../docs/CAMPUS-DETAIL-UPGRADE.md) covers discovery, complete layer inspection, comparison and versioned exchange exports. ArcGIS Pro is optional for the application. Use its own Python environment for project creation and native analysis; public discovery and portable exports have separately documented dependencies. Keep portal authentication local, use new output directories, and retain unresolved rights/dates in private evidence. `arcgis/study_workflows.py` and `arcgis/study_batch_appearance.py` operate on new synthetic fixtures; they do not edit campus sources or establish desktop interaction acceptance.

[Imports and verification](../docs/CAMPUS-IMPORTS.md#verification) · [Source updates](../docs/SOURCE-UPDATES.md) · [Deployment](../docs/DEPLOYMENT.md) · [Configuration](../docs/CONFIGURATION.md).
