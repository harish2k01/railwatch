# Product scope and production readiness

This document describes implemented capabilities separately from deployment and operational acceptance gates. The items requiring installation-specific evidence are listed below.

## Implemented capabilities

- Private account workspaces, administrator/user roles, signup controls, invitations, temporary passwords, resets and atomic first-administrator creation.
- Dedicated frontend, persistent backend and PostgreSQL; server-controlled feature availability and encrypted provider credentials.
- Journey planning without requiring a PNR, booking state, automatic completion, archived cancellation history and linked recurring onward/return routines.
- Configurable booking window, Sunday-first calendar, rolling routine horizon, holidays/leave, CSV import and iCalendar export.
- Current notifications and opt-in device, email and Telegram reminders, deduplication, durable leases, bounded retries, delivery-failure diagnostics and outbound Telegram polling.
- Normal and Tatkal plans with separate reminder schedules, configurable cancellation follow-ups and per-journey overrides.
- Local PDF text/QR/OCR extraction, account-owned PDF storage/viewing, seven-day original-file retention, and image extraction without storage.
- Email ownership verification and opt-in SMTP booking reminders, SMTP invitations/reset/test delivery, branded HTML, structured API/provider/scheduler logs, and release/version endpoints.
- PR unit/database/browser tests, CodeQL, build checks and immutable release images.

## Validation and remaining work

Subtle interface motion is implemented for page headings, dialogs, menus, drawers,
new list items and control feedback. Motion never delays actions, does not replace
Kanban drag transforms, and is disabled for the system reduced-motion preference.
Tab and view changes also fade without remounting forms, including calendar and journey views and User Settings tabs. Further motion should follow the same accessibility and responsiveness constraints.

| Area | Current limitation and next work |
| --- | --- |
| Reminder recovery | Recent outage misses are recorded and visible; administrators can queue audited, eligibility-checked retries. Broader recovery retention/policies remain future work. See reminder-operations.md. |
| Reminder control | Current notification bell with content removal on clear, external delivery channels, journey snooze/resume, and opt-in IST quiet hours. Encrypted internal delivery records support retries and diagnostics; clearing current notifications removes their content. See notification-controls.md. |
| Large accounts | Journey lists and Ticket Vault have encrypted indexed search and full-account counts. Dashboard uses aggregates and short previews, Calendar uses paged visible ranges with exact day counts, and Routines load without occurrence history. Staged normalized storage supports narrow partial saves and scheduler account sweeps. Daily reconciliation, routine changes, full exports and Google Calendar still load complete account data; production latency/lateness targets remain to be agreed. See account-scale.md and workspace-storage.md. |
| Calendar and planning | CSV holiday import, ICS export and a month agenda exist. ICS holiday import, broader overflow accessibility and actionable duplicate/overlap/leave-conflict suggestions remain. |
| Editing and navigation | Journey summaries and guarded item editors exist. Individual journey links and account/admin settings guards are implemented. Physical-device acceptance remains. |
| Production operations | Queue/heartbeat metrics, administrator warnings and alert-rule templates exist. Monitoring scrape/receiver verification, backup-age metrics, agreed latency/lateness targets, off-cluster restore and rollback rehearsals, and broader accessibility/visual-regression validation remain gates. |

The operational items above require evidence in the current installation. A successful build or unit test is not proof of backup recoverability or provider delivery.

## Product boundaries

Dashboard, journey board/list and Holidays & Leave support daily planning. Week start, booking-window rules and the routine planning horizon are shared administrator settings. Reminder preferences remain configurable per account and journey. Automatic ticket booking is outside scope.

Journey planning does not require a live PNR provider. Original PDFs require a connection to the RailWatch account; the service worker does not cache private files. Google Calendar requires administrator OAuth setup and individual account authorization, with live synchronization verified when enabled.

## Data compatibility

Database migrations, schema compatibility, backup import and workspace normalization protect saved data. Synthetic tickets and regression fixtures remain in automated tests.

## Email delivery and ownership

When SMTP is configured, users request a 24-hour verification link under Profile and explicitly confirm it before opting into Email Reminders under Connections. Signup and first-administrator bootstrap remain usable without SMTP. The upgrade clears earlier verification timestamps, which could have been stamped by temporary-password or invitation setup. Existing accounts must confirm ownership before opting in; login and saved plans are unaffected. Email changes revoke unused account tokens and clear verification; the scheduler rechecks the current verified address and preference before delivery. Emailed password-reset tokens prove ownership. Invitations can be shared manually by administrators, so invitation links and administrator-issued temporary passwords do not mark an email verified.

SMTP booking reminders use the same schedule, durable leases, retries and notification failure reporting as the other channels. Removing SMTP pauses queued email delivery without consuming retries. Email addresses and message bodies are not logged.

Device push now includes encrypted subscriptions, persistent VAPID identity, device ownership/quota checks, expired endpoint removal and stable notification tags. Physical Android/iPhone delivery and status-bar acceptance remains required; see mobile-pwa.md.
