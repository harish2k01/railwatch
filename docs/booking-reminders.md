# Booking and cancellation reminders

Choose Normal or Tatkal when creating an unbooked journey. Normal bookings use the administrator's advance booking window. Tatkal opens one day before the train departs from its originating station: 10 AM IST for AC or 11 AM IST for non-AC. Enter the train's originating date, which may differ from the boarding date. See [IRCTC's Tatkal FAQ](https://contents.irctc.co.in/en/TatkalFaq.html). Availability and permitted classes depend on the train; RailWatch records plans and does not book tickets.

User Settings → Preferences provides independent schedules for normal, Tatkal AC and Tatkal non-AC bookings. Add up to 20 reminders with a number of days before opening and an IST clock time; zero means opening day. Journey and routine overrides can replace these defaults. Existing three-choice preferences remain supported until edited.

Cancellation reminders run while a journey is To Cancel. Choose a daily IST time, or explicit days before travel, in Preferences or the journey editor. Confirmation of cancellation, archiving, or passing the travel date stops delivery. Messages explicitly ask the user to cancel through IRCTC. Push, in-app, verified email and connected Telegram use the same scheduler and preferences. WhatsApp requires a separate approved cancellation template with two body parameters: route and travel date; the normal booking template retains three parameters.

The scheduler keeps stable per-channel/device identities and rechecks the current journey and preferences before sending. Booking and cancellation notification payloads are distinguished so an old unread booking alert cannot hide a cancellation alert.

Apple push requests use IPv4 because the deployment's network has no usable IPv6 route. Delivery failures log the safe HTTP status or network error code without exposing subscription URLs. HTTP 201 confirms acceptance by Apple's push service; actual device display still depends on notification permission and the device's settings.

Desktop journey clicks open editing directly. Mobile clicks retain a summary before editing. The phone calendar uses a week selector and daily agenda, with a date picker for other months. PDF tickets render pages vertically, loading pages near the viewport and retaining zoom, fit-width and download controls.
