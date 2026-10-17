# Campus detail presentation plans

These versioned plans contain only presentation changes against the published October 15 LASU and UNILAG packages: expected geometry hashes, illustrative appearance, land-class interpretation, landmark metadata and greenery region recipes. They contain no newly discovered ArcGIS geometry, private edits or credentials. Existing attribution applies; see [data attribution](../ATTRIBUTION.md).

Regenerate a new plan from the immutable baseline and reviewed local candidate:

```sh
cd web
node scripts/export-campus-detail-plan.mjs CAMPUS_ID STUDY_FOLDER NEW_PLAN_JSON
```

The study folder contains `baseline.json` and `detail-preview/{candidate,edits}.json`. Keep the original evidence immutable. The [detail preparation worker](../../scripts/prepare-campus-detail-release.mts) validates the current public version and private workspace, skips saved corrections and changed footprints, and checks unchanged geometry/routing. Prepare produces a sanitized receipt; apply requires its exact workspace hash, creates a verified private rollback copy, and submits normal independent review. It grants no approval or publication permission. [Operational procedure](../../docs/DEPLOYMENT.md#campus-detail-preparation).
