# Notification history and controls

The Notifications page shows account-owned reminder outcomes with read, snooze and resume actions. A journey dialog also has **Notification History**, scoped to that journey, including scheduled and sending jobs, current outcomes, delivery-attempt counts and provider-safe error messages.

General history returns 25 outcomes per page. Journey history examines up to 100 owned records per request because historical journey IDs are inside encrypted payloads. Next advances the scan even when a page has no matching records. Cursors and journey ownership are checked against the authenticated account. Provider credentials and encrypted job payloads are never returned.

Snooze pauses an actionable journey for 30 minutes, one hour or one day. Resume brings deferred jobs forward. Quiet hours are configured in User Settings and use IST; in-app reminders remain available. Eligibility is checked again before delivery.

Email, Telegram and device reminders open the specific journey through an account-authorized link. Sign-in preserves the journey destination. A link does not grant access to another user's journey.

Attempt counts and errors describe the current job record. A separate per-attempt event timeline and an indexed journey-history projection remain future work.
