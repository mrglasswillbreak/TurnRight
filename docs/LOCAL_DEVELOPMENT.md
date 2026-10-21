# Local editor

The local editor uses the official Supabase CLI stack: PostgreSQL 17 with PostGIS,
Auth, REST and private Storage. Application requests run through the existing API
handlers and permission checks. Data and uploads persist until an explicit reset.
The fixtures are synthetic; they do not contain either published campus package.

## Prerequisites and fresh clone

The root README and [quality map](QUALITY.md) expose the setup/check entry points.
Portable Python quality dependencies are hash-locked through root `requirements.txt`.
After initial dependencies/images are downloaded, `npm run test:python:isolated`
runs native processing acceptance in a read-only, network-disabled container and
rejects skipped native tests. The full local editor generates disposable credentials;
its application owner can inspect synthetic failures in **Workspace â†’ System health**.

Use Linux, or a Linux checkout inside Windows WSL2. Install Docker Engine and its
CLI yourself, with permission to run containers, and allow enough disk space for
Supabase and the pinned GDAL images. Native Windows can run the public Vite app
but cannot run the isolated import workers. No Windows services or system settings
are changed by the repository commands.

The root `Dockerfile`, shared by `.devcontainer` and `docker-compose.yml`, defines Python
3.12 and Node 22.23.3/npm 10.9.9. Open the Linux/WSL checkout
with an editor supporting development containers. It uses the host Docker socket
and a matching checkout path so isolated workers can mount their temporary files.
Only use this development container with a trusted checkout and Docker host.
Alternatively, install those Node/Python versions in your Linux environment.

```sh
npm ci
npm run doctor -- --full
python -m pip install --require-hashes -r scripts/requirements-data.lock
npm run local:up
```

With Docker Compose installed, `npm run local:container` builds the same toolchain
and starts the local editor inside it. Run this from a Linux/WSL checkout. The
checkout must have the same absolute path on the Docker host; the development
container shares the host Docker socket for the existing isolated workers.

The first start downloads the official Supabase images and builds the existing
GIS/import images. All canonical migrations in `supabase/migrations` run without
renaming or modifying them. Open `http://127.0.0.1:5180/admin`. Keep the terminal
running. The browser must use this exact loopback origin.

## Accounts and data

`.local-runtime/accounts.json` contains four generated accounts, each with a
different random password: administrator, editor, reviewer and publisher. Use its
email/password in the development sign-in form. Supabase issues real sessions.
The file is ignored by Git and must not be uploaded or included in build artifacts.
Account creation is idempotent; startup never replaces an existing password.

All four accounts belong to Local North Campus (`lasu`, retained for compatibility
with the application's default campus). Only the administrator belongs to Local
South Campus (`local-south`), allowing a real cross-campus denial check. Open
`/admin?campus=local-south` to switch. Roles retain their normal capabilities;
independent snapshot review remains required. Synthetic baseline packages live
under `.local-runtime/public`; mutable drafts and uploads live in Supabase volumes.

## Operations and limits

Editing, CSV imports, uploaded GIS files, photo/model private storage, analysis,
exports and source/snapshot review use the normal application contracts. The local
dispatcher accepts only the GIS, file-import and source-review workers. It runs
one job at a time with a bounded queue; the existing network-disabled GDAL
containers retain their memory, CPU and scratch-directory controls. Job logs stay
in the ignored `.local-runtime/jobs` directory.

Uploaded file sources in this loopback sandbox enable proposal generation when
dispatched, so their comparisons can reach source review. The dispatcher uses a
fixed SQL statement through the local database container's administrative role;
the canonical API-role restrictions on source policy remain intact. Acceptance remains an
explicit editor action and snapshot approval remains independent. Hosted sources
retain the existing shadow-first rollout and per-source administrative policy.

External source downloads and cloud publication are disabled. Use uploaded
files locally. Production publication requires the separately configured hosted
environment described in [DEPLOYMENT.md](DEPLOYMENT.md), including independent
review and the existing release gates. Local commands remove inherited hosted
Supabase/GitHub settings before starting the app and workers. The local sign-in
form is only imported by Vite's development build.

```sh
npm run local:test   # Destructive only to synthetic test records; real API journey
npm run local:down   # Stop services; retain database and uploaded files
npm run local:up     # Resume existing data
npm run local:reset -- --confirm-local-reset  # Delete local work and reseed
```

Reset is explicit and always targets the local CLI stack. Never use linked-project
or production database flags. Reset stops the application. Run `npm run local:up`
again, reopen the app and sign in with the newly generated account passwords.

## Troubleshooting and verification

If startup fails, check Docker availability and that ports 5180, 54320â€“54322 are
free. Restore a missing `accounts.json` from your own backup, or explicitly reset;
the seed refuses to silently replace existing identities. An interrupted job may
need cancellation/retry through Activity, preserving normal uncertain-completion
semantics. Restart does not interpret an uncertain worker result as success.

The `CI / local-stack` Linux CI job installs committed locks,
builds the development image, applies migrations to a clean Supabase stack and
checks real sign-in, roles, campus denial, editing, idempotent saves, independent
review (including denial when a contributor also holds the reviewer role), metric
buffer analysis, isolated file import and source acceptance, export, private
photograph/model upload and readback, cancellation, restart persistence and reset.
Its receipt records the exact revision. Existing browser, native GIS, database,
offline and restoration checks remain separate required release evidence.
