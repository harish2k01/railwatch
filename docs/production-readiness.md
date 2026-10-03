# Product scope and production readiness

Reviewed against merged main on 2 October 2026. This is a current implementation audit, not a claim that every production gate has been met. The original design roadmap is available in Git history; obsolete preview documents and screens are not restored.

## Implemented core

- Private account workspaces, administrator/user roles, signup controls, invitations, temporary passwords, resets and atomic first-administrator creation.
- Dedicated frontend, persistent backend and PostgreSQL; server-controlled feature availability and encrypted provider credentials.
- Journey planning without requiring a PNR, booking state, automatic completion, archived cancellation history and linked recurring onward/return routines.
- Configurable booking window, Sunday-first calendar, rolling routine horizon, holidays/leave, CSV import and iCalendar export.
- In-app and Telegram reminders, deduplication, durable leases, bounded retries, delivery failure notifications and outbound Telegram polling.
- Local PDF text/QR/OCR extraction, account-owned PDF storage/viewing, seven-day original-file retention, and image extraction without storage.
- Email ownership verification and opt-in SMTP booking reminders, SMTP invitations/reset/test delivery, branded HTML, structured API/provider/scheduler logs, and release/version endpoints.
- PR unit/database/browser tests, CodeQL, build checks and immutable release images.

## Remaining from the original plan

Subtle interface motion is implemented for page headings, dialogs, menus, drawers,
new list items and control feedback. Motion never delays actions, does not replace
Kanban drag transforms, and is disabled for the system reduced-motion preference.
Tab and view changes also fade without remounting forms, including calendar and journey views and User Settings tabs. Further motion should follow the same accessibility and responsiveness constraints.

| Area | Current limitation and next work |
| --- | --- |
| Reminder recovery | Recent outage misses are recorded and visible; administrators can queue audited, eligibility-checked retries. Broader recovery retention/policies remain future work. See reminder-operations.md. |
| Notification control | The header inbox links to paginated, account-owned notification history. Journey snooze/resume and opt-in IST quiet hours defer delivery without consuming attempts. A detailed per-attempt timeline and indexed per-journey history filtering remain. See notification-controls.md. |
| Large accounts | Journey lists and Ticket Vault have encrypted indexed search and full-account counts. Dashboard uses aggregates and short previews, Calendar uses paged visible ranges with exact day counts, and Routines load without occurrence history. Canonical workspace writes/bootstrap reconciliation and scheduler scaling remain. See account-scale.md. |
| Calendar and planning | CSV holiday import, ICS export and a month agenda exist. ICS holiday import, broader overflow accessibility and actionable duplicate/overlap/leave-conflict suggestions remain. |
| Editing and navigation | Journey summaries and guarded item editors exist. Linkable individual journey URLs and unsaved-change protection for account/admin settings remain. |
| Production operations | Queue/heartbeat metrics, administrator warnings and alert-rule templates exist. Monitoring scrape/receiver verification, backup-age metrics, agreed latency/lateness targets, off-cluster restore and rollback rehearsals, and broader accessibility/visual-regression validation remain gates. |

The operational items above require evidence in the current installation. A successful build or unit test is not proof of backup recoverability or provider delivery.

## Decisions that superseded the original design

Dashboard and Kanban replaced the proposed Today/Trips table. Holidays & Leave remains a separate page. Telegram is the chosen first external reminder channel; Discord is not an outstanding requirement. Week start and booking-window controls are shared administrator settings. Routine horizon defaults to six months. Browser push is opt-in per device and uses outgoing-only scheduled delivery. Automatic ticket booking remains outside scope.

PNR providers, offline ticket access and Tatkal-specific planning were optional follow-up ideas, not blockers for the planning/reminder core. PDF import, originally optional, is now implemented. Google Calendar and WhatsApp adapters exist, but their external setup and actual live delivery must be verified when they are enabled.

Standalone PWA installation metadata, mobile navigation and an offline reconnect screen are implemented. No private account data or ticket PDFs are cached by the worker. Physical Android/iPhone installation, keyboard and safe-area checks remain acceptance work after rollout; see mobile-pwa.md and ux-review.md.

## Cleanup boundaries

No interactive prototype route, demo workspace seed or browser-persisted prototype planner ships with the app. Negative tests for retired routes and synthetic ticket fixtures remain intentional regression coverage. Database migrations, schema compatibility, backup import and workspace normalization are retained to protect saved data. Test mocks, form placeholders, local development defaults and request AsyncLocalStorage are not prototype features.

## Email delivery and ownership

When SMTP is configured, users request a 24-hour verification link under Profile and explicitly confirm it before opting into Email Reminders under Connections. Signup and first-administrator bootstrap remain usable without SMTP. The upgrade clears earlier verification timestamps, which could have been stamped by temporary-password or invitation setup. Existing accounts must confirm ownership before opting in; login and saved plans are unaffected. Email changes revoke unused account tokens and clear verification; the scheduler rechecks the current verified address and preference before delivery. Emailed password-reset tokens prove ownership. Invitations can be shared manually by administrators, so invitation links and administrator-issued temporary passwords do not mark an email verified.

SMTP booking reminders use the same schedule, durable leases, retries and notification failure reporting as the other channels. Removing SMTP pauses queued email delivery without consuming retries. Email addresses and message bodies are not logged.

Device push now includes encrypted subscriptions, persistent VAPID identity, device ownership/quota checks, expired endpoint removal and stable notification tags. Physical Android/iPhone delivery and status-bar acceptance remains required; see mobile-pwa.md.
