# Configuration inventory

Generated from `scripts/configuration.json` by `npm run check:configuration -- --write`.
The check fails when a new environment reference lacks an entry or this document drifts.

Public development needs no credentials. The full local stack generates its own disposable
credentials. Hosted editing requires the public Supabase pair and server Supabase pair;
worker dispatch and publication additionally require their service configuration.
Worker identifiers and claim tokens are supplied per job, never copied into a global `.env`.

Use [the setup guide](CONFIGURATION.md) for placement and [.env.example](../.env.example)
for the hosted setup template. Sensitive entries belong in local ignored state or a service
secret store. Public keys and deployment IDs are configuration, not secret credentials.

| Name | Scope | Sensitive | Purpose |
| --- | --- | --- | --- |
| `ADMIN_USER_ID` | server | No | Original-owner Auth UUID used during local bootstrap and hosted setup. |
| `APPLICATION_DEPLOYMENT_ID` | tool | No | Deployment identifier being verified, supplied to the verification tool. |
| `APPLY_LAYER_UPGRADE` | tool | No | Explicit apply switch for a reviewed layer-upgrade snapshot. |
| `APPLY_UNILAG` | tool | No | Explicit apply switch for a reviewed UNILAG upgrade. |
| `BENCHMARK_OUTPUT` | tool | No | Local model-editor benchmark report path. |
| `CAMPUS_ID` | worker | No | Campus identifier supplied per request or workflow; not a global campus restriction. |
| `CAMPUS_INPUT` | build | No | Reviewed input package path for the package builder. |
| `CAMPUS_NAME` | build | No | Display name for the package being built. |
| `CAMPUS_SLUG` | build | No | URL slug for the package being built. |
| `CI_PRODUCTION` | local | No | Production marker that prevents local development commands from running. |
| `CLEANUP_RUN_ID` | tool | No | Exact preview-access run selected for cleanup. |
| `DEV` | runtime | No | Vite-provided development boolean; not a user configuration variable. |
| `DOCS_PUBLIC_ORIGIN` | tool | No | Public origin used while preparing documentation screenshots. |
| `EXPECTED_MODEL_PLAN` | tool | No | Reviewed model-import plan hash binding pinned assets and the explicit review decision before apply. |
| `EXPECTED_SNAPSHOT` | tool | No | Required immutable layer-upgrade snapshot hash before applying. |
| `EXPECTED_UNILAG_SNAPSHOT` | tool | No | Required immutable UNILAG snapshot hash before applying. |
| `GH_TOKEN` | ci | Yes | GitHub workflow token used to download an explicitly pinned proposal release asset from this repository. |
| `GIS_BACKUP_EXCLUDED_TABLES` | tool | No | Explicit table exclusions recorded by the GIS backup tool. |
| `GIS_BACKUP_PUBLIC_KEY` | tool | No | Public encryption key for a private GIS backup; the decryption key stays outside CI. |
| `GIS_DEPLOYMENT_MODE` | tool | No | Explicit GIS deployment verification mode. |
| `GIS_IMAGE` | worker | No | Pinned local container image for network-isolated GIS processing. |
| `GIS_IMPORT_IMAGE` | worker | No | Pinned local container image for network-isolated format conversion. |
| `GIS_JOB_ID` | worker | No | Immutable processing-job identifier supplied by dispatch. |
| `GIS_TEST_DATABASE_URL` | tool | Yes | Disposable test database URL; acceptance tools reject production database names. |
| `GITHUB_ACTOR` | ci | No | GitHub-provided actor name recorded in the private model-import receipt; never used as a fabricated campus identity. |
| `GITHUB_ACTIONS` | ci | No | GitHub-provided runner marker. |
| `GITHUB_REF` | ci | No | GitHub-provided branch or tag reference; review continuation requires refs/heads/main. |
| `GITHUB_REPOSITORY` | server | No | Owner/repository used for authorized worker dispatch. |
| `GITHUB_RUN_ID` | ci | No | GitHub-provided run identifier used in verification and cleanup receipts. |
| `GITHUB_SHA` | ci | No | GitHub-provided source revision used in health and verification receipts. |
| `GITHUB_STEP_SUMMARY` | ci | No | GitHub-provided job-summary output path. |
| `GITHUB_TOKEN` | ci | Yes | GitHub-provided short-lived job credential; never a browser setting. |
| `GITHUB_WORKFLOW_TOKEN` | server | Yes | Repository-scoped credential with the Actions access required by worker dispatch. |
| `GITLEAKS_ENABLE_COMMENTS` | ci | No | CI disables automated pull-request comments. |
| `GITLEAKS_ENABLE_UPLOAD_ARTIFACT` | ci | No | CI disables upload of secret findings. |
| `GITLEAKS_VERSION` | ci | No | Pinned secret-scanner binary version. |
| `IMPORT_ID` | worker | No | Import-job identifier supplied by dispatch. |
| `IMPORT_RETENTION_ENABLED` | worker | No | Explicit repository-variable opt-in to import retention maintenance. |
| `JOB_ID` | worker | No | Source-refresh job identifier supplied by dispatch. |
| `MODEL_ARCHIVE_SHA256` | tool | No | Reviewed portable model proposal ZIP SHA256; every archive entry also requires its manifest hash. |
| `MODEL_INSPECT_ONLY` | tool | No | Read-only model workspace audit that requires no archive and performs no remote writes. |
| `MODEL_OWNER_OVERRIDE` | tool | No | Explicit audited original-owner review override, disabled by default and bound to the preparation plan. |
| `MODEL_OVERRIDE_REASON` | tool | No | Concrete original-owner review reason recorded by the normal GIS decision API; required for an override. |
| `MODEL_RELEASE_ASSET_ID` | tool | No | Immutable numeric GitHub release asset ID for the pinned model proposal ZIP in this repository. |
| `NODE_ENV` | runtime | No | Node runtime mode; local workers reject production. |
| `npm_config_user_agent` | runtime | No | npm-provided version information used by the runtime doctor. |
| `OVERPASS_SCHEDULE_ALLOWED` | server | No | Explicit endpoint permission gate for scheduled OSM requests; defaults disabled. |
| `OVERPASS_URL` | worker | No | Authorized Overpass endpoint override for source acquisition. |
| `PUBLISHED_MAP_URL` | build | No | Stable HTTPS publication origin. The local stack supplies its own loopback URL. |
| `RELEASE_ID` | worker | No | Independently reviewed release identifier supplied by dispatch. |
| `RELEASE_OPERATION` | worker | No | Authorized preview or publish operation supplied by dispatch. |
| `RELEASE_SUMMARY` | build | No | Review summary embedded in the generated package. |
| `REPORT_RATE_SALT` | server | Yes | Private salt for anonymous-report rate buckets. |
| `RUN_TOKEN` | worker | Yes | Per-attempt import claim token supplied by dispatch. |
| `SOURCE_ID` | worker | No | Source identifier supplied for a single scoped check. |
| `SOURCE_PYTHON` | tool | No | Python executable override for independent source-snapshot verification. |
| `SOURCE_REDISTRIBUTION_APPROVED` | build | No | Build gate backed by the source owner’s permission record. |
| `SOURCE_REVIEW_OPERATION_ID` | worker | No | Durable source-review operation identifier supplied by dispatch. |
| `SOURCE_REVIEW_RUN_TOKEN` | worker | Yes | Per-attempt source-review claim token supplied by dispatch. |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Yes | Private server service-role credential; never exposed to Vite. |
| `SUPABASE_URL` | server | No | Server Supabase origin for database, authentication and private storage. |
| `SUPERSEDES_UNILAG_RELEASE` | tool | No | Previous release identifier recorded by the snapshot tool. |
| `TURNRIGHT_COVERAGE` | tool | No | Opt-in collection of coverage from Chromium acceptance journeys. |
| `TURNRIGHT_DOCS_DATE` | tool | No | Deliberate evidence date for documentation capture. |
| `TURNRIGHT_DOCS_SCREENSHOTS` | tool | No | Explicitly enables opt-in documentation capture journeys. |
| `TURNRIGHT_GIS_SCREENSHOTS` | tool | No | Set to 1 to include opt-in GIS documentation captures. |
| `TURNRIGHT_LOCAL_DISPATCH_TOKEN` | local | Yes | Random local dispatch credential generated by local:up and kept in ignored runtime state. |
| `TURNRIGHT_LOCAL_DISPATCH_URL` | local | No | Generated loopback-only local worker-dispatch URL. |
| `TURNRIGHT_LOCAL_RUNTIME` | local | No | Enables the isolated local dispatch adapter; rejected on production hosts. |
| `VERCEL` | ci | No | Vercel-provided deployment marker. |
| `VERCEL_GIT_COMMIT_SHA` | ci | No | Vercel-provided source revision reported by health checks. |
| `VERCEL_ORG_ID` | ci | No | Deployment team/project owner identifier. |
| `VERCEL_PROJECT_ID` | ci | No | Deployment project identifier. |
| `VERCEL_TOKEN` | ci | Yes | Private deployment credential held in the GitHub secret store. |
| `VERIFY_BASELINE` | tool | No | Baseline evidence directory used by the globe verifier. |
| `VERIFY_BYPASS` | tool | Yes | Private deployment-protection bypass used only by verification tools. |
| `VERIFY_ENGINE` | tool | No | Browser engine selected by the globe verifier. |
| `VERIFY_EXPECTED_MODEL_IDS` | tool | No | Optional JSON array of exact LASU detailed building IDs required by campus verification; omission permits older releases without detail models. |
| `VERIFY_ORIGIN` | tool | No | Explicit deployment origin being verified. |
| `VERIFY_OUTPUT` | tool | No | Verification receipt and screenshot directory. |
| `VERIFY_SCOPE` | tool | No | Campus or verification scope selected by the caller. |
| `VERIFY_SKIP_OFFLINE` | tool | No | Explicit focused-verification override; cannot count as complete offline acceptance. |
| `VISUALS_INPUT` | build | No | Reviewed visual asset input path for package generation. |
| `VITE_LOCAL_DEVELOPMENT` | public | No | Set only by the isolated local server and configured-build test. |
| `VITE_SUPABASE_ANON_KEY` | public | No | Public Supabase anonymous key, protected by server authorization and row policies. |
| `VITE_SUPABASE_URL` | public | No | Public Supabase project URL. Required only for hosted authentication and editing. |

CI-only scanner switches and `TURNRIGHT_COVERAGE` are set by their workflow/test harness.
Vite, Node, npm, GitHub and Vercel supply the entries marked as runtime/provider context.
They are documented for traceability and do not add setup requirements.
