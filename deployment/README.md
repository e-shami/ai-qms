# Deployment: Render + Vercel

Preparation only: no resources or accounts are created by these files. Finish and
verify the priority/intake application work before deploying. Follow each step in
order, checking it before continuing. No custom domain is required.

## 1. Verify the repository and local defaults

GitHub workflows and the progress checkpoints are included in version control.
Legacy `docker-compose.prod.yml` remains local/ignored; Render does not use it.
Do not include `.env`, tokens, or credentials in Git. Rotate credentials previously
exposed in tracked examples before deploying; sanitized examples do not erase history.

With required `.env` values configured (including a strong `SECRET_KEY`):

```sh
docker compose config --quiet
docker compose up --build
```

Default services are Postgres, backend, frontend, Adminer, and the WhatsApp bot.
The bot requires Meta and Upstash credentials. For frontend/backend-only local
work use `docker compose up --build db backend frontend`.
CV is excluded from the default build/start; opt in explicitly when needed:

```sh
docker compose --profile cv config --quiet
docker compose --profile cv up --build
```

Camera/device access still needs host-specific setup. Previously started CV
containers are not stopped merely by omitting the profile; stop those explicitly.

CI runs these required checks on main/develop pushes and PRs (or manual dispatch):

- **Check Backend**: Python compilation and `python -m unittest discover -s tests -v`, including intake, token copy/position, bot lookup, and prediction regressions. It installs `httpx` and `httpx2` for FastAPI test clients and sets `PYTHONPATH` to the repository root, `ml-notebooks`, and `backend`.
- **Check PostgreSQL Migrations**: actual `alembic upgrade head` / `alembic downgrade base`, then the PostgreSQL intake regression script against a fresh disposable PostgreSQL 16 service. Covers legacy backfill, migration/ORM constraints, downgrade/upgrade, and concurrent issuance/dispatch; no deployment database or secrets are used.
- **Check Frontend**: `npm ci`, `npm run lint`, `npm run build`, and `npx --yes tsx@4.20.6 --test tests/*.test.tsx`. Next's build generates route types before checking TypeScript. The pinned test runner is downloaded by CI without changing project dependencies or lockfiles.
- **Check WhatsApp Bot**: `npm ci`, `npx tsc --noEmit`, `npm test`, and `npm run build`, including intake, status, and webhook regressions.
- **Build Docker (backend/frontend/whatsapp-bot)**: builds all three images after the checks above, without publishing.

Backend Ruff/mypy gates are not configured and are **not run**; compilation is
not linting or static type analysis. Bot ESLint has no configuration and is
**not run**. Neither omission is a passing lint check. The Edge-specific browser
runners in `frontend/tests` and `backend/tests/token-copy-ui.cjs` remain manual
and are not covered by the Node regression suite; see `frontend/tests/README.md`.
CI requires package registry access, including for the pinned TSX runner.

CV is only checked/built by manually
dispatching `CV (Manual Only)`; normal CI does not download YOLO dependencies.
Require the CI checks in GitHub branch protection before merging to `main`.
Changing job names requires updating any existing required checks.

## 2. Create external accounts and data stores

You need GitHub, Render, Vercel, Neon, Upstash, and a Meta WhatsApp Cloud API app.
Create a Neon Postgres database and an Upstash Redis database in your own accounts;
select free plans explicitly and review billing settings before confirming.
Choose nearby regions for the data stores and Render services.

Use the Neon **direct** connection URL for the initial single-instance setup,
because the same URL runs Alembic migrations. Change its scheme from
`postgresql://` to `postgresql+psycopg://`, preserving the TLS query parameters
(including `sslmode=require`). Never disable TLS. Keep credentials in provider
environment settings only. The current Alembic config uses ConfigParser, so
percent-escaped credentials can require application-side interpolation handling;
use Neon's generated password and verify migration startup before proceeding.
Upstash must supply its HTTPS REST URL and REST token, not a `redis://` URL.

Generate separate strong random values for `SECRET_KEY`, `INTERNAL_API_KEY`, and
`WEBHOOK_VERIFY_TOKEN`. Backend and bot must share the same `INTERNAL_API_KEY`.
Meta supplies `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, and `WHATSAPP_APP_SECRET`.
Use a suitable long-lived Meta token rather than relying on a temporary test token.

## 3. Connect Render

Import the repository as a Blueprint using root `render.yaml` and branch `main`.
Review the two **free Docker web services** before creation. Render builds the
backend and bot from their own Docker contexts, not GHCR. CV is not provisioned.
`sync: false` prompts for values on creation; subsequent changes belong in the
service Environment dashboard. Check actual assigned `onrender.com` URLs rather
than assuming the requested names are available.

| Service | Variable | Value |
| --- | --- | --- |
| Backend | `DATABASE_URL` | Neon URL described above |
| Backend | `SECRET_KEY` | Random JWT signing secret |
| Both | `INTERNAL_API_KEY` | Same random internal secret |
| Both | `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID` | Meta credentials |
| Backend | `WHATSAPP_BOT_NUMBER` | Public international number, digits only |
| Backend | `CORS_ORIGINS` | JSON array: `["https://YOUR-PROJECT.vercel.app"]` |
| Bot | `BACKEND_API_URL` | `https://YOUR-BACKEND.onrender.com/api/v1` |
| Bot | `PUBLIC_WEB_URL` | `https://YOUR-PROJECT.vercel.app` |
| Bot | `WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Verification secret and Meta app secret |
| Bot | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash REST credentials |

If URLs are not known on first creation, update them after the provider assigns
them and redeploy before testing. Free Render services cannot receive private
network traffic: the bot must use the backend's public HTTPS URL.
For backend template-based WhatsApp copies, optionally configure
`WHATSAPP_COPY_TEMPLATE` and `WHATSAPP_COPY_LANGUAGE` with approved Meta values.
Both services use `WHATSAPP_API_VERSION=v23.0`; confirm your Meta app supports it.

The backend runs `alembic upgrade head` before starting Uvicorn and stops if
migrations fail. It respects Render's `PORT`, with local fallback `8000`; the bot
already reads `PORT` and the Blueprint sets it to `10000`. Do not override the
backend start command or run duplicate migrations. Keep one backend instance and
one Uvicorn worker: migrations and in-memory real-time state are not prepared for
parallel replicas. Back up the database before schema changes and use compatible
migrations because the old instance may still serve traffic during a rollout.
There is no automatic migration rollback or production data seeding.

## 4. Connect Vercel

Import the same GitHub repository with these native project settings (no Docker
or custom `vercel.json` needed):

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | Next.js |
| Node.js | 24.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Framework default; do not override |
| Production Branch | `main` |
| `NEXT_PUBLIC_API_URL` | `https://YOUR-BACKEND.onrender.com/api/v1` |
| `NEXT_PUBLIC_WS_URL` | `wss://YOUR-BACKEND.onrender.com/ws` |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Public WhatsApp number, digits only |

These public variables are embedded at **build time**; redeploy after changing
them. The socket client appends `/queue`, so do not include that suffix in the
WS base. Browsers connect straight to Render, not through a Vercel proxy.
Never put internal keys, DB URLs, or Meta tokens into `NEXT_PUBLIC_*` variables.
Set backend CORS and bot `PUBLIC_WEB_URL` to the final stable Vercel URL, without
a trailing slash. Preview URLs need explicit CORS entries and preferably separate
test data/services; do not wildcard credentialed CORS or connect untrusted PRs to
production data.

## 5. Check the deployment and enable delivery

Check `/health` on both Render services and inspect migration logs. Health routes
alone do not prove Neon, Redis, or Meta work. Test login, token issuance and lookup,
queue updates across two browsers, and a signed WhatsApp message end-to-end.
Set Meta's webhook callback to `https://YOUR-BOT.onrender.com/webhook`, verify it
with `WEBHOOK_VERIFY_TOKEN`, and subscribe to the required message events.
Confirm cold-start behavior before relying on timely webhook responses.

Render uses `autoDeployTrigger: checksPass` on `main` after native Git integration
is connected. Vercel's native Git integration builds previews and production
deployments independently; it does not automatically wait for this GitHub workflow.
Use required PR checks and protected `main` (no direct pushes) to gate production
changes. Initial provider deployments must still be verified manually. No GitHub
deployment tokens, SSH keys, or deploy-hook secrets are needed for this approach.

The old Oracle workflow is now a manual **notice only**, with no SSH or deployment
steps. `docker-compose.prod.yml` remains a legacy self-hosting reference, not part
of Render. It requires `IMAGE_REPOSITORY=lowercase-owner/repository`, deliberately
built/published images and tags, Cloudflare credentials, and operator review.
CI no longer publishes GHCR images. Frontend URLs must be provided as Docker build
arguments for legacy images; runtime environment changes cannot rewrite them.

## Limits and costs

Provider documentation checked on 2026-09-24; recheck before deployment.

- [Render Free](https://render.com/docs/free): **750 instance hours per workspace per month**, shared by both services. Two always-running services need 1,440-1,488 hours in a 30-31 day month, so both cannot run continuously on this allowance. Exhaustion suspends free services. Idle services sleep after 15 minutes; wake-up takes about a minute, which can delay or fail webhooks. Free instances have 512 MB RAM, ephemeral storage, and no shell access. Measure backend memory rather than assuming its ML dependencies fit. Render does not recommend free instances for production.
- Render bandwidth/build allowances are separate. Overages can be billed with a payment method; without one, services/builds can be suspended. Configure pipeline spend limits. External DB/API traffic can also trigger free-service restrictions. Do not use keep-alive pings to claim an always-on free setup.
- [Neon pricing](https://neon.com/pricing): Free currently includes 100 CU-hours/project, 0.5 GB storage, and 5 GB egress; compute sleeps after inactivity. Exhaustion can suspend compute or block writes. Paid plans are metered. This Blueprint intentionally does not create a Render free database, which expires after 30 days.
- [Upstash pricing](https://upstash.com/docs/redis/overall/pricing): Free currently includes 256 MB, 500K commands/month and 10 GB bandwidth. Session operations consume commands. Review card/upgrade settings: paid tiers have different billing, and free allowances do not carry over automatically.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): restricted to personal, non-commercial use with usage limits. An institutional/commercial deployment may require a paid plan. Do not assume this QMS qualifies for Hobby merely because traffic is small.
- Meta messaging/template rules and charges are independent. None of this guarantees zero cost, production availability, regulatory compliance, or suitability for sensitive patient data.

References: [Render Blueprint spec](https://render.com/docs/blueprint-spec),
[Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).
