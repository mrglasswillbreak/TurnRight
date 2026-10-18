# Local editor

The local editor uses the official Supabase CLI stack: PostgreSQL 17 with PostGIS,
Auth, REST and private Storage. Application requests run through the existing API
handlers and permission checks. Data and uploads persist until an explicit reset.
The fixtures are synthetic; they do not contain either published campus package.

## Prerequisites and fresh clone

Use Linux, or a Linux checkout inside Windows WSL2. Install Docker Engine and its
CLI yourself, with permission to run containers, and allow enough disk space for
Supabase and the pinned GDAL images. Native Windows can run the public Vite app
but cannot run the isolated import workers. No Windows services or system settings
are changed by the repository commands.

The `.devcontainer` defines Python 3.12 and Node 22.23.3. Open the Linux/WSL checkout
with an editor supporting development containers. It uses the host Docker socket
and a matching checkout path so isolated workers can mount their temporary files.
Only use this development container with a trusted checkout and Docker host.
Alternatively, install those Node/Python versions in your Linux environment.

```sh
npm ci
npm run setup
python -m pip install -r scripts/requirements-data.txt
npm run local:up
```

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
or production database flags. Reopen the app and sign in with the newly generated
account passwords after resetting.

## Troubleshooting and verification

If startup fails, check Docker availability and that ports 5180, 54320–54322 are
free. Restore a missing `accounts.json` from your own backup, or explicitly reset;
the seed refuses to silently replace existing identities. An interrupted job may
need cancellation/retry through Activity, preserving normal uncertain-completion
semantics. Restart does not interpret an uncertain worker result as success.

The `Licensing readiness / local-stack` Linux CI job installs committed locks,
builds the development image, applies migrations to a clean Supabase stack and
checks real sign-in, roles, campus denial, editing, idempotent saves, independent
review, isolated file import, export, cancellation, restart persistence and reset.
Its receipt records the exact revision. Existing browser, native GIS, database,
offline and restoration checks remain separate required release evidence.
