# Mobile installation and verification

RailWatch exposes a same-origin manifest with standalone display, regular/maskable PNG icons and an Apple touch icon. The application uses its normal login, backend and PostgreSQL workspace when opened from the home screen. Provider connections remain outgoing; installation adds no webhook or inbound integration port.

## Phone workspace

At widths up to 768 pixels, RailWatch uses dedicated phone screens with Home, Journeys, Tickets and More in the bottom navigation. The desktop dashboard and Kanban remain available at larger widths.

Home prioritizes the next trip, booking openings and cancellation actions. Journeys uses searchable status lists with date/routine filters, sorting and additional-page controls. Tickets opens the original PDF directly; its action menu also opens journey details or downloads the ticket. More contains Calendar, Routines, Holidays & Leave, User Settings, notification history and administrator pages when permitted. Installation is at the bottom of More.

Calendar uses a seven-day selector and a paginated agenda for the selected date. Choose date reaches any month; calendar filters control travel, booking openings and time off. Routines retain linked-return, pause, resume and removal actions. Consecutive time off is grouped into expandable ranges with individual removal controls.

Journey details and forms fill the phone screen. Back and close preserve the existing unsaved-change confirmation. User Settings opens grouped sections for profile, preferences, configured connections and security. Theme switching remains in the workspace header. All screens use the same authenticated APIs and account data as desktop; the phone presentation adds no offline private-data storage.

## Install

- Android Chrome: open the HTTPS RailWatch address, use **Install RailWatch** under **More**, or the browser menu's **Install app / Add to Home screen** option. The in-app button opens a native prompt only when the browser offers one.
- iPhone/iPad: open the address in Safari, tap **Share → Add to Home Screen**, and launch the new icon. If the browser offers an **Open as Web App** option, enable it.
- Desktop: **Install RailWatch** uses the browser prompt where supported, otherwise shows instructions.

An ordinary bookmark opens in a browser tab. Home-screen installation is the option intended for a separate app window. Production needs HTTPS; localhost is supported for development. Self-hosted plain HTTP remains a normal website and does not promise installability or a service worker.

## Offline and update behavior

Only `/offline.html`, a public reconnect screen, is stored by the service worker. Account HTML, API responses, login credentials and PDF tickets are not added to Cache Storage. Navigation goes to the network first, so deployments do not require an old application shell to expire. Private tickets remain on the server and need connectivity; push subscriptions are stored encrypted in PostgreSQL. On worker updates, old RailWatch offline-document caches are removed and the worker is revalidated without HTTP caching.

## Device acceptance after deployment

Responsive Chrome checks at 320, 390, 768 and 1482 pixels cover both themes. They do not substitute for these physical-device checks:

1. Install and relaunch on Android Chrome and iPhone Safari; confirm icon, standalone window and login behavior.
2. Verify all four bottom navigation destinations, More pages, grouped settings, journey lists, day agenda and ticket viewer.
3. Focus forms with the keyboard open; confirm no unwanted zoom, obscured save controls or safe-area overlap.
4. Turn the network off, relaunch and verify the reconnect page; reconnect and confirm normal access.
5. Deploy an update and relaunch; verify fresh application assets and private-account separation after sign-out/sign-in.

References: [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps), [MDN installation guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing), [MDN install prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).

## Device notifications

Enable in User Settings > Connections > Device Notifications, then send a test. Permission is requested only from that explicit button. Desktop browsers and Android support web push; iOS/iPadOS 16.4+ requires installing on the home screen and opening that installation before enabling. Delivery depends on OS permissions, connectivity and browser push service availability; it is not guaranteed at an exact instant.

The backend creates one encrypted, persistent VAPID identity in PostgreSQL, shared across replicas. Preserve the database and APP_ENCRYPTION_KEY on restores. All delivery is outgoing HTTPS to the browser push service; no incoming webhook or public callback is needed. The app origin still needs HTTPS and must be reachable for login and subscription changes. Backend egress must allow supported Google, Mozilla, Apple or Windows push services on TCP 443. Unsupported endpoints are rejected.

Each device is independently registered (maximum ten per account). Disable removes only that device. Switching accounts cannot overwrite the original owner subscription. Scheduled jobs recheck active account, journey, reminder policy and subscription before sending. Existing scheduler leases and retries handle transient failures; HTTP 404/410 removes expired devices. Failures appear in the notification inbox. Stable journey tags replace visible notifications for the same journey; ambiguous network failures may still cause transport retries.

Physical acceptance: allow and send a test on desktop Chrome, Android installed Chrome and installed iPhone Safari; close the app and verify a scheduled reminder; disable and confirm no further push; revoke OS permission and check the UI. iOS status-bar metadata changes may require closing/reopening or reinstalling an existing home-screen app. Check the top area in dark mode and that dialogs have one vertical scroll surface with no horizontal scrolling.

Platform reference: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
