# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately before public disclosure.

1. Open a private security advisory in this repository, or
2. Contact the maintainer directly through the repository owner channel.

Include:

- Affected area and impact
- Reproduction details
- Proof-of-concept (if safe)
- Suggested mitigation if available

## Response expectations

- Initial triage acknowledgement target: 3 business days
- Status update target after triage: 7 business days

## Security baseline

- Secret and dependency checks run in CI policy workflows.
- Service credentials remain in managed secret stores only.
- Security/dependency cadence and ownership live in `/docs/SECURITY-HYGIENE.md`.
