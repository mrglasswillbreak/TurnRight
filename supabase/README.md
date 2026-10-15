# Database migrations

`migrations/` contains the ordered, additive SQL history. The current source requires **001–050**. This range describes repository requirements; it does not prove which migrations are installed in a particular project.

For a new installation, follow [Deployment](../docs/DEPLOYMENT.md) and apply the full numeric sequence. For an existing installation, inspect the installed schema/receipts, preserve a verified backup, and apply only missing migrations in order. Never rename, squash, or rerun initialized migrations as directory cleanup.

Migrations 042–044 add bounded published-correction reads and source map previews. Migrations 045–048 add source-check evidence, private recovery, provenance and retry protection. Migrations 049–050 repair history reads and bound evidence storage while retaining recovery receipts. Their rollout requires shadow comparisons and explicit per-source enablement; installing SQL alone is not rollout completion. [Source reliability rollout](../docs/SOURCE-UPDATES.md#staged-reliability-rollout).

The unit suite exercises PGlite/PostGIS fixtures. Native PostgreSQL/PostGIS, concurrency, permissions, backup restore, and worker gates remain separate CI checks. Use disposable databases for acceptance. See [Configuration](../docs/CONFIGURATION.md#database-and-private-storage), [GIS rollout](../docs/GIS-PLATFORM.md#additive-rollout-and-recovery), and [Production receipts](../docs/PRODUCTION.md).
