# Reminder controls

Reminders arrive through opted-in device push, Telegram, WhatsApp, or email. There is no user notification feed or delivery-history page. Existing /notifications bookmarks redirect to My Journeys.

Journey reminder controls can pause an actionable journey for 30 minutes, one hour, or one day. Resume brings deferred jobs forward. Quiet hours are configured in User Settings and use IST. Eligibility is checked again before delivery; snooze does not consume attempts.

The server retains encrypted delivery records for retry safety, deduplication, and operational diagnostics. Removing the inbox does not delete that evidence. Pending legacy in-app jobs are cancelled when reconciled; no new in-app jobs are generated.

Administrators use Reminder delivery to distinguish future scheduled deliveries from due work and overdue work (more than five minutes late). Counts describe deliveries, including a separate delivery per enabled device. Manual recovery remains an explicit, audited action.
