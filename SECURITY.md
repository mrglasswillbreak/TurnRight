# Security

## Report a vulnerability

Contact the repository owner privately through an available GitHub contact channel. If this repository offers **Security → Report a vulnerability**, use that private reporting form. Do not post credentials, private campus records, exploitable details, or personal location data in a public issue. No dedicated security mailbox or response-time commitment is currently published.

Include the affected revision, a minimal reproduction using synthetic data, the expected permission boundary, and the observed result. Avoid testing against production accounts or altering public maps. For ordinary bugs without security implications, use a normal issue with sensitive information removed.

## Operational boundaries

[Private error monitoring](docs/ERROR-MONITORING.md) stores allowlisted categories,
status, revision and UUID references only. The server checks the application owner
before returning global monitoring data; campus administrator membership alone is
insufficient. Migration 057 denies anonymous/authenticated database access and
bounds retained data. Browser diagnostic buffers remain local until explicitly
downloaded. Delivery refuses redirects and cannot replace the original error.

- Keep service-role credentials, workflow tokens, deployment credentials, private backups, and signing material out of Git and browser bundles. Only public client configuration belongs in `VITE_*` variables.
- Campus membership, capability checks, database grants, and row-level security must agree. Authentication alone grants no campus membership.
- Imports and processing use bounded, isolated workers. Preserve their network, filesystem, upload, and execution limits.
- Source acceptance, private recovery, snapshot approval, and publication are distinct operations. Preserve immutable evidence and audit records.
- Rotate an exposed credential in its owning service and assess its use. Removing it from a working tree alone does not revoke it or remove Git history.

There is no declared supported-version or security-audit certification policy. Release checks and their limits are recorded in [Acceptance](docs/ACCEPTANCE.md) and [Production](docs/PRODUCTION.md). Backup, retention, and access requirements are in [Deployment](docs/DEPLOYMENT.md) and [Configuration](docs/CONFIGURATION.md).

## Automated checks

The [security workflow](.github/workflows/security.yml) audits all locked npm and Python dependencies, scans pull-request changes and every reachable historical file version with Gitleaks, and runs Semgrep security rules for JavaScript/TypeScript, Python and Actions. Scanner versions, the container digest and community-rule revision are pinned. Semgrep runs inside the CI runner with metrics disabled; JSON/SARIF reports remain workflow artifacts. The private personal repository does not support GitHub's hosted dependency comparison or CodeQL service, so these checks do not depend on either integration.

Untrusted XML readers use the explicitly locked `defusedxml` parser. Import limits and external KML-reference rejection remain enforced. Backup verification requires the complete 16-byte AES-GCM authentication tag. Regression tests reject entity expansion, preserve an earlier source snapshot on failed parsing, and reject truncated backup tags.

Gitleaks exceptions match exact documented public policy identifiers or integrity digests; reader-boundary fragments are restricted to immutable historical blob IDs. A self-test verifies detection of a credential deleted from the current checkout. Semgrep exceptions are attached to specific findings with an adjacent explanation of the constrained inputs, such as fixed SVG geometry, numeric array indices, shell-free argument vectors or formula-safe CSV output. Reassess that explanation whenever the input source or validation changes; do not suppress whole files or add an unreviewed baseline. Scan failures and parse errors remain blocking.
