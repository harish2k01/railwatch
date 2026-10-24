# RailWatch Deployment

The dashboard is at `/`, authentication at `/login`, and each section has its own route. PostgreSQL holds private account workspaces, encrypted tickets, jobs, and provider credentials.

## Local Run

Run `docker compose up --build` for PostgreSQL, migrations, a frontend on port 3000, and a persistent backend. Compose credentials are for development only; its named volume persists across updates. Alternatively configure `.env` from `.env.example`, install dependencies, generate Prisma, apply migrations, and run `npm run dev`. The backend scheduler runs automatically; no external cron or worker is required. See [service architecture](service-architecture.md).

## Manual Kubernetes Deployment

Pin `ghcr.io/harish2k01/railwatch` to the digest in the release's `image.json` asset. The homelab deployment uses namespace `railwatch`, PostgreSQL 18 with database/user `railwatch`, separate frontend and backend replicas, a backend scheduler, and daily database backups. Deployment manifests remain local until GitOps is enabled.

The public URL is `https://railwatch.k8s.harish2k01.xyz`. The HTTPRoute references `traefik/traefik-gateway`, listener `websecure`, and path prefix `/`. The existing `wildcard-k8s-tls` certificate covers this hostname; no additional certificate or Caddy site is required.

Set runtime `APP_URL` to the public HTTPS URL. Supply an externally managed `railwatch-secrets` Secret with:

- `POSTGRES_USER`, `POSTGRES_DB`, and a random `POSTGRES_PASSWORD`.
- `DATABASE_URL`: `postgresql://railwatch:<URL-encoded-password>@railwatch-postgres:5432/railwatch`.
- `APP_ENCRYPTION_KEY`: base64 of 32 random bytes. Preserve and back up this key separately.
- Independent random `CRON_SECRET` and `RATE_LIMIT_SALT` values.

Never commit populated secrets. Run Prisma migrations before rollout, then verify readiness, backend scheduler execution, and HTTPS. Supply registry credentials if the GHCR package is private. Backups contain encrypted plans and ticket files; restoration also requires the original encryption key. Supplement daily cluster-storage backups with an off-cluster copy and a restore test.

## Accounts And Shared Settings

The first account becomes administrator. Admin Settings controls signup availability, booking-window days, reminders, WhatsApp, Google Calendar, ticket uploads, and calendar exports for every account. Disabled features disappear from User Settings; provider actions are also blocked on the server.

Admin Settings / User Management supports invitations, temporary-password accounts, role changes, and account disabling. Temporary-password users must choose their own password before accessing plans. Invitations expire after 24 hours and can be used once. Configure SMTP in Admin Settings or through `SMTP_URL` and `EMAIL_FROM`. Without SMTP, administrators can copy and share the invitation link.

Users manage username, email, phone, preferences, connections, and passwords in User Settings. Changing email requires the current password. Email/password changes sign out other sessions. Plans and tickets are private per account. Upload limits are 10 MB per PDF and 250 MB per account. Images and QR codes only extract details locally and are not stored.

## App Integrations

Configure providers in Admin Settings / Integrations. Credentials are encrypted in PostgreSQL and never returned by the settings API. Empty secret fields retain stored values; the Remove Configuration action in each provider menu disable the provider, including environment fallback. Updates apply immediately without restarting pods. Environment variables remain supported when no in-app override is stored. Back up the database and encryption key together.

### WhatsApp

In Meta, configure WhatsApp Business Cloud API, a registered business sender, an authorized access token, and an approved template. Enter the access token, sender Phone Number ID (not the recipient number), supported Graph API version, template name, and language in RailWatch. The template must have three body parameters: route, travel date, and booking-opening date/time. Meta permissions and template approval are completed outside RailWatch.

Users add their own international number under User Settings / Profile and opt into reminders under Connections. They do not need Meta developer credentials. The administrator must enable reminders and WhatsApp. Saved configuration indicates credentials are present; it does not prove that Meta accepted them or that a message was delivered. Verify live delivery after setup. A retry may duplicate a message if Meta accepted it but its response was lost.

### Google Calendar

The administrator creates a Web Application OAuth client in Google Cloud, enables Calendar API, and configures the consent screen/test users or publishing. Enter its client ID and client secret in RailWatch. Register the exact redirect URI shown in Integrations: `<APP_URL>/api/railwatch/google/callback`.

Each user authorizes their own Google account under User Settings / Connections. RailWatch requests `calendar.app.created` and creates a dedicated calendar for journeys, booking events, and company/personal holidays. App credentials stay server-side; user tokens remain private and encrypted. Changing/removing the app credentials pauses all Google connections and requires users to reconnect. Reconnection after an app credential change may create a new RailWatch calendar; previously created calendars are retained in Google.

## Validation

`npm run verify` checks types, lint, coverage, release logic, and production build. Database tests need `RUN_DB_TESTS=1` and an isolated database ending in `_test`. Browser tests need `RUN_E2E=1`, that isolated database, and Playwright Chromium. They reset the test database and cover private workspaces, routing, tickets, invitations, user access, and feature controls. Never run them against production. CI runs browser tests on PRs; release validation excludes them.

### Shared Planning Controls

Admin Settings > General controls the first weekday (Sunday by default) and recurring journey generation. The default is six calendar months from the current IST date, rather than six months from a future routine start. Alternatively, administrators can choose an upcoming journey count per routine (1-100). End dates remain an upper bound. Generated plans replenish when the workspace loads and during backend scheduled processing. Reducing a limit removes only future untouched To Book entries; booked tickets, archived history, past journeys, and individual overrides remain.

Journey details show the quota-specific booking opening date and time. Reminders are delivered through enabled external channels; the app has no notification inbox. Apply the `20261002000400_planning_controls` migration before starting the updated frontend and backend.
