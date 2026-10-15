# Web application

This directory is the Vercel application root and the Node package root. Use Node **22.23.3** and run commands here.

```sh
npm ci
npm run dev
```

The development server runs the public seed without credentials. It does not emulate `api/` or Supabase. For connected team editing, follow [Deployment](../docs/DEPLOYMENT.md). [Environment template](.env.example).

| Path                            | Role                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| `src/`                          | Public map/globe, routing, offline storage, team editor and domain modules |
| `components/`, `hooks/`, `lib/` | Shared interface primitives and utilities                                  |
| `api/`, `server/`               | Vercel entry points and server-only operations                             |
| `public/`                       | Intentionally public runtime assets; no private exports                    |
| `tests/`                        | Unit/database tests, Playwright journeys and regression fixtures           |
| `scripts/`                      | Build checks, asset preparation, measurements and documentation captures   |
| `work/`, `dist/`, `outputs/`    | Ignored local work and generated output                                    |

Run `npm test -- --maxWorkers=2`, `npm run lint`, `npm run check:docs`, and `npm run build` for the main checks. `npm run check:configured-build` additionally measures the bundle with isolated authentication configuration; do not deploy that fixture output. Browser and offline commands are documented in [Contributing](../CONTRIBUTING.md).

[Project overview](../README.md) · [Architecture](../docs/ARCHITECTURE.md) · [Repository structure](../docs/REPOSITORY.md) · [Screenshot capture](../docs/SCREENSHOTS.md).
