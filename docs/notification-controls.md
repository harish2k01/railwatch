# Reminder controls

Reminders arrive through opted-in device push, Telegram, WhatsApp, or email. The notification bell shows current booking and cancellation reminders, including when no external delivery channel is enabled. Selecting a reminder opens its journey. There is no delivery-history page; existing /notifications bookmarks redirect to My Journeys.

Clear an individual reminder or use **Clear all** to remove its message across devices. Clearing erases the stored message content. A minimal deduplication key remains so the scheduler cannot restore a cleared reminder. Future reminder times create separate notifications. The bell refreshes when opened, when the app becomes visible, and once a minute while visible.

Journey reminder controls can pause an actionable journey for 30 minutes, one hour, or one day. Resume brings deferred jobs forward. Quiet hours are configured in User Settings and use IST. Eligibility is checked again before delivery; snooze does not consume attempts.

Current bell content is encrypted and stored separately from provider delivery records. New current reminders follow snoozes and quiet hours and use the same 24-hour automatic recovery window as delivery. Old delivery records are never imported into the bell. The server retains encrypted provider records for retry safety, deduplication, and operational diagnostics. Clearing the bell does not remove that evidence. Pending legacy in-app jobs are cancelled when reconciled; no new legacy inbox jobs are generated.

Administrators use Reminder delivery to distinguish future scheduled deliveries from due work and overdue work (more than five minutes late). Counts describe deliveries, including a separate delivery per enabled device. Manual recovery remains an explicit, audited action.
