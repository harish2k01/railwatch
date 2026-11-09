# RailWatch

A self-hosted train travel planner with recurring journeys (routines), booking reminders, a Today page, a journeys timeline and board, a calendar with month, week and agenda views, company holidays and personal leave, and private PDF ticket storage with local image/QR extraction.

## Run locally

Requires Node.js 24+ and PostgreSQL. Copy .env.example to .env, configure a fresh database and a base64-encoded 32-byte encryption key, then run:

```sh
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

Or use `docker compose up --build` for a local app, dedicated frontend, persistent backend, PostgreSQL, and one-time migrations. Compose credentials are for development only. Sign up at http://localhost:3000; the first account is administrator.

## Architecture

RailWatch runs as three separate services: a Next.js frontend, a Fastify backend, and PostgreSQL. The frontend renders pages and proxies same-origin `/api/*` requests; it has no database or provider credentials. The backend owns authentication, authorization, accounts, plans, ticket storage, SMTP, and integrations. Both application services use the same versioned image with `RAILWATCH_SERVICE=frontend` or `backend` and can be scaled separately.

Scheduled work runs inside the persistent backend. Once a minute it completes booked journeys after their travel date in IST, archives cancelled or skipped journeys after the account’s configured period (seven days by default), replenishes routines, reads Telegram messages with outgoing requests, reconciles reminders, delivers due jobs, and synchronizes calendars. PostgreSQL advisory locking prevents overlapping scheduler runs across replicas. Reminder jobs retain their durable leases, retries, and delivery records. Regular API requests never spawn Kubernetes jobs. One-time database migrations and database backups remain operational jobs.

Linked routines appear together, with a separate recurrence, next scheduled date and controls for each direction. Routine changes are reviewed against the complete account plan before saving: the review counts added, changed, removed and retained journeys without saving the proposed change. Confirmation uses the reviewed workspace revision; concurrent changes require a fresh review. Booked tickets, history and individual exceptions remain protected. A scheduled date describes the recurrence, not a confirmed train departure.

`BACKEND_URL` points the frontend to the private backend (default `http://127.0.0.1:3001`). The backend listens on `BACKEND_PORT` (default 3001). Only the frontend needs to be exposed. `APP_URL` is the canonical URL users access, including an HTTP LAN URL if hosting without a domain. Provider traffic is outgoing; optional OAuth consent returns through the user's browser. See [service deployment](docs/service-architecture.md).

## Deployment and providers

[Deployment guide](docs/railwatch-deployment.md) covers GHCR releases, manual Kubernetes hosting, secrets, backups, and Google Calendar OAuth. Providers can be configured later.

[Ticket reader](docs/ticket-reader.md) covers viewing, search, zoom, and opening the original.

[Booking and cancellation reminders](docs/booking-reminders.md) explains normal/Tatkal dates, custom reminder schedules, cancellation follow-ups, and device notifications.

Navigation is Today (`/`), Journeys (`/journeys`), Calendar (`/calendar`), Time off (`/time-off`) and Settings (`/settings`); Routines (`/routines`) and Tickets (`/tickets`) are secondary links. On phones the tab bar is Today, Journeys, Calendar and More. `/settings` is for every account: You (profile, reminders, channels, security), Data (backup, restore, calendar export) and, for administrators, Workspace at `/settings/workspace` (`/members`, `/integrations`, `/health`). Old `/holidays` and `/admin/*` links redirect permanently. Opening a journey shows a read-only detail panel first (stages, ticket, details, reminders and notes); Edit is in its More journey actions menu, and `?journey=<id>` deep links open the same panel. Admin Settings separates booking rules, calendar and routines, integrations, email delivery, user access, reminder delivery, and feature availability. Administrators control shared booking rules and features, configure encrypted Telegram/Google credentials in the app, create or invite users, and manage roles and access. Each account has a private workspace. Reminders arrive through enabled delivery channels without a separate notification inbox. Journey reminder controls offer snooze/resume; optional quiet hours are configured under Preferences. See [notification controls](docs/notification-controls.md).

Set `APP_URL` to the public base URL at runtime so invitation links, password resets, and Google OAuth use the deployed hostname. The first account becomes administrator. Existing RailWatch installations can apply the checked-in Prisma migrations; a fresh installation starts with an empty database.

Planned or booked trips on time off appear under Needs a decision on Today and on Time off: Skip this trip skips it (and, for a routine trip, adds the date to the routine's exceptions), Keep stops it being raised again. Time off opens with upcoming time off and marks ranges in progress and how many trips fall on them; Trips during your time off offers Skip it or Keep. Past entries remain available through the Past filter; consecutive matching days stay together, including ranges already in progress. Expand a range to manage individual days. Long-weekend suggestions use the same saved holidays, leave and booking rules on desktop and mobile.

## Tickets and history

**Import tickets** on the Tickets page reads up to 30 IRCTC e-ticket PDFs on the device, matches each to a journey (PNR, then route, on the travel date) and shows it as Matched, Check or New journey. Confirming uploads the originals and saves every attached or created journey in one workspace commit; a failed save removes the uploaded files.

Ticket extraction reads PDF text and QR codes, and uses local browser OCR for scanned PDFs and ticket images. English recognition assets ship with the app; recognition does not send ticket pixels to an external service. Review detected details before applying them. Completed journeys appear in History and archived cancellations retain entered ticket details. Original PDFs are deleted after the account’s configured retention period (default seven days after cancellation or completion).

## Verify

`npm run verify` runs type checking, lint, coverage, and the production build. Database tests need `RUN_DB_TESTS=1` and an isolated database ending in `_test`. Browser tests need `RUN_E2E=1`, that isolated database, and Playwright Chromium: `npm run test:e2e`. The browser suite resets the test database.

Booking day (from a planned journey's panel, the day before booking opens or later) shows an IST countdown, a checklist kept on the device, Open IRCTC, and the outcome: Confirmed, RAC or Waitlisted marks the journey booked with that ticket status; Try Tatkal switches the quota; Skip this trip skips it. Settings → Workspace → System health shows the running and latest version, scheduler status and 24-hour delivery failure rates per channel.

## Releases

Every PR needs exactly one label: `major`, `minor`, or `patch`. Each merged PR still gets its own version tag and release notes, but one release run builds and deploys only the newest version: older releases in the same batch are marked superseded. The release `verify` job is skipped when the merge commit's tree equals the PR head that already passed `verify`. After merge, validation runs before release reconciliation assigns the next version to each merged PR in order. The release workflow publishes that exact commit to GHCR with `vX.Y.Z`, `X.Y.Z`, full commit-SHA, and latest aliases. The `image.json` release asset records the digest, and the newest release is committed to the homelab-ops chart for Argo CD to deploy. Retries reuse an existing commit image. Apply the migrations for each release; ordinary upgrades preserve the existing database.

The deployment chart and Argo CD Application live in [homelab-ops](https://github.com/harish2k01/homelab-ops/tree/main/charts/railwatch).

## Ticket files and retention

Uploaded PDF originals are encrypted in PostgreSQL's `RailFile` table as raw AES-256-GCM bytes (`payloadBytes`), read and written through `src/lib/ticket-storage.ts`. They are not stored on a frontend or backend pod filesystem. Open **View Ticket** in Ticket Vault or a journey's attachments to read the original inside RailWatch; PDFs support page navigation. Images and QR codes extract details locally and are not uploaded or stored. Download and remove actions use the attachment menu.

The backend scheduler permanently removes original files after the configured period following cancellation or completion (default seven days), including for disabled accounts. It also removes their attachment references atomically. Journey history, entered ticket details, and notes remain available in the archive. Historical database backups retain their own independent retention policy.

## Operations and code navigation

Frontend API gateway logs and backend request logs share `x-request-id`, with method, route, status, and duration. Successful health checks are suppressed. Scheduler, Telegram polling, Google synchronization, SMTP delivery, reminder failures, and file cleanup emit structured JSON to stdout/stderr. Logs exclude credentials, cookies, ticket contents, and request bodies. Inspect them with `kubectl -n railwatch logs deployment/railwatch-frontend` or `kubectl -n railwatch logs deployment/railwatch-backend`.

SMTP authentication can succeed even when a sender address is rejected. The Sender field must use an address or verified alias authorized for the authenticated account. The test action reports sender rejection separately from authentication and connectivity failures.

`src/backend/server.ts` handles API routing; `src/backend/scheduler.ts` elects a scheduler leader. `src/lib/railwatch-store.ts` manages encrypted workspaces and concurrent edits; `travel-planner.ts` owns planning and journey lifecycle rules; `ticket-retention.ts` selects expired originals; `railwatch-jobs.ts` dispatches reminders. UI components live under `src/components/travel-planner`. Named methods include purpose comments. Existing database table names and applied migration directory names are intentionally preserved to keep upgrades compatible.

## Product scope and readiness

RailWatch supports journey planning, account-owned tickets and scheduled reminders. [Production readiness](docs/production-readiness.md) records operational validation and known limitations. Synthetic data is confined to automated test fixtures.

### Email booking reminders

Configure and test SMTP under Admin Settings. Users verify their saved email under User Settings → Profile, confirm the emailed link, and opt into Email Reminders under Connections. Verification links expire after 24 hours and can be used once. Changing the email pauses delivery until the new address is verified. Reminders use branded HTML with a plain-text alternative and the backend's durable schedule/retry queue; administrators can review delivery failures under Reminder delivery. SMTP is optional for self-hosting and does not block initial administrator setup or signup.

For administrator recovery and monitoring, see [reminder operations](docs/reminder-operations.md).

For paginated journey lists, encrypted search and remaining scaling work, see [account scale](docs/account-scale.md). For staged row storage, scheduler limits and rollback, see [workspace storage](docs/workspace-storage.md).

For desktop Board/List views, travel-date ranges, quick filters and account-wide matching counts, see [journey workspace](docs/journey-workspace.md).

For the brand colours, logo, icons and station directory, see [design system](docs/design-system.md).

## Station refresh and retention

See [native NTES station refresh](docs/stations.md). The station directory is derived only from NTES; legacy station-building tools are removed. Settings → Devices & data → Data retention lets each account set cancelled/skipped trip archiving and original PDF deletion periods (1–3650 days). Both default to 7 days for existing and new accounts. PDF age starts at completion/cancellation, independently of archive age. Shorter retention applies to already eligible files on cleanup, including workspace saves; increases cannot restore deleted files. Journey history, entered ticket details and past time off remain.

## PNR status

Opening journey details refreshes PNR status, with a manual retry action and no tracking toggle or scheduled polling. Passenger statuses, chart preparation and supplied coach/berth fields are stored privately with a last-checked time. Failed enquiries retain the last successful result; explicit cancellation of every passenger moves an active journey to Cancelled. See [PNR status](docs/pnr-status.md) for setup and limits. Fare ingestion and Spend are unchanged.
