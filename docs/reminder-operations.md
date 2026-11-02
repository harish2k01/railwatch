# Reminder recovery and monitoring

Admin Settings → Delivery Health shows shared scheduler health, queue delays,
missed reminders, exhausted retries and a paginated recovery list. Refresh reads
current state; it never triggers delivery.

Schedules less than 24 hours overdue keep automatic bounded retries. Older
scheduled reminders are held as `MISSED` (including plans created after their reminder time), with recovery limited to the preceding
30 days and journeys that still need action. They appear in the user's notification
inbox without a burst of old push/email/Telegram messages. Changing the
journey, disabling reminders, removing a device or changing its recipient invalidates
the old job. Daily cancellation reminders resume on the current day's schedule.

The action menu lets administrators retry one missed or failed reminder explicitly.
The retry is rate-limited and audited, resets its retry budget and uses the existing
scheduler lease. Both the request and the eventual delivery recheck eligibility.
A provider can accept a request before its response is lost, so retrying can produce
a duplicate; the UI explains this before confirmation. Sent reminders cannot be
retried through this interface. Cancellation after queuing stops the reminder.

Apply migration `20261003000200_reminder_recovery` before rolling out the backend.
It adds a nullable retry marker and a shared scheduler heartbeat table; existing
workspace payloads, tickets and provider settings are unchanged.

## Monitoring

`GET /api/health/metrics` returns Prometheus text. It requires
`Authorization: Bearer <CRON_SECRET>`; use the existing Kubernetes Secret through
your monitoring system's secret reference, never a committed token or query string.
The response is not cached and contains no account, route, ticket or provider-secret
labels (channel labels use a fixed allowlist). The frontend forwards it to the backend like other API traffic. Health
readiness remains a database availability check, independent of queue health.

Exposed metrics include last successful scheduler timestamp, last run duration,
total scheduler failures, pending/failed/missed/exhausted reminder counts and the
oldest overdue queued reminder age. Delivery Health warns after three minutes
without success, five minutes of active processing or queue delay, and any missed
or exhausted reminders. Heartbeats are written only by the replica holding the
PostgreSQL scheduler lock and survive restarts.

Use `monitoring/railwatch-alerts.yaml` as the alert-rule group in your existing
Prometheus rule configuration after configuring an authenticated scrape. Adjust
its `job="railwatch"` selector to your scrape job. The rules are shipped but are not
automatically installed into your cluster or connected to notification receivers.
An actual scrape and a test alert must be verified before claiming alert delivery.
Backup freshness/restore evidence and API latency targets remain separate work;
these metrics do not claim to monitor backups or prove recovery.
