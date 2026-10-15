# Security

## Report a vulnerability

Contact the repository owner privately through an available GitHub contact channel. If this repository offers **Security → Report a vulnerability**, use that private reporting form. Do not post credentials, private campus records, exploitable details, or personal location data in a public issue. No dedicated security mailbox or response-time commitment is currently published.

Include the affected revision, a minimal reproduction using synthetic data, the expected permission boundary, and the observed result. Avoid testing against production accounts or altering public maps. For ordinary bugs without security implications, use a normal issue with sensitive information removed.

## Operational boundaries

- Keep service-role credentials, workflow tokens, deployment credentials, private backups, and signing material out of Git and browser bundles. Only public client configuration belongs in `VITE_*` variables.
- Campus membership, capability checks, database grants, and row-level security must agree. Authentication alone grants no campus membership.
- Imports and processing use bounded, isolated workers. Preserve their network, filesystem, upload, and execution limits.
- Source acceptance, private recovery, snapshot approval, and publication are distinct operations. Preserve immutable evidence and audit records.
- Rotate an exposed credential in its owning service and assess its use. Removing it from a working tree alone does not revoke it or remove Git history.

There is no declared supported-version or security-audit certification policy. Release checks and their limits are recorded in [Acceptance](docs/ACCEPTANCE.md) and [Production](docs/PRODUCTION.md). Backup, retention, and access requirements are in [Deployment](docs/DEPLOYMENT.md) and [Configuration](docs/CONFIGURATION.md).
