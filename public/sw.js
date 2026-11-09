/* Only the public offline document and its reader script are cached. Account pages, API data and PDFs
   remain network-only; offline tickets live encrypted in IndexedDB (plan 3.6), not in Cache Storage. */
const OFFLINE_CACHE = "railwatch-offline-v2";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll(["/offline.html", "/offline-reader.js"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("railwatch-offline-") && key !== OFFLINE_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const target = new URL(event.request.url);
  if (event.request.method === "POST" && target.origin === self.location.origin && target.pathname === "/share-target") { event.respondWith(receiveShare(event.request)); return; }
  if (event.request.mode !== "navigate" || event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});

// Restricts notification clicks to this application's journey route.
function journeyDestination(value) {
  try {
    const url = new URL(value || "/journeys", self.location.origin);
    if (url.origin !== self.location.origin || url.pathname !== "/journeys") return "/journeys";
    const id = url.searchParams.get("journey");
    return id && id.length <= 128 ? "/journeys?journey=" + encodeURIComponent(id) : "/journeys";
  } catch { return "/journeys"; }
}

// Display one notification per journey; URLs are constrained to the current origin.
self.addEventListener("push", event => {
  let payload;
  try { payload = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(payload.title || "RailWatch", {
    body: payload.body, tag: payload.tag || "railwatch", icon: "/icons/app-192.png",
    data: { url: journeyDestination(payload.url), journeyId: journeyId(payload.url) }, renotify: false,
    // Plan 3.7: booking reminders can be acted on without opening the app.
    actions: payload.actions === "booking" ? [{ action: "booked", title: "Mark booked" }, { action: "snooze", title: "Snooze 1 hour" }] : [],
  }));
});
/** Reads the journey id from a same-origin journey link. */
function journeyId(value) { try { const id = new URL(value || "/", self.location.origin).searchParams.get("journey"); return id && id.length <= 128 ? id : ""; } catch { return ""; } }
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const id = event.notification.data?.journeyId;
  if (id && (event.action === "booked" || event.action === "snooze")) {
    // Same-origin, cookie-authenticated request; on failure, open the journey instead.
    event.waitUntil(fetch("/api/railwatch/notifications", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event.action === "booked" ? { action: "booked", journeyId: id } : { action: "snooze", journeyId: id, minutes: 60 }) })
      .then(response => { if (!response.ok) throw new Error(); })
      .catch(() => self.clients.openWindow(new URL(journeyDestination(event.notification.data?.url), self.location.origin).href)));
    return;
  }
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async windows => {
    const target = new URL(journeyDestination(event.notification.data?.url), self.location.origin).href;
    const client = windows.find(window => new URL(window.url).origin === self.location.origin);
    if (client) { await client.navigate(target); return client.focus(); }
    return self.clients.openWindow(target);
  }));
});

// Share target: keep what was shared (at most 10 files of 10 MB) in a private cache, then open the app to handle it.
async function receiveShare(request) {
  try {
    const form = await request.formData(), cache = await caches.open("railwatch-share");
    for (const key of await cache.keys()) await cache.delete(key);
    const files = form.getAll("files").filter(f => f instanceof File && f.size <= 10 * 1024 * 1024).slice(0, 10);
    const meta = { text: [form.get("title"), form.get("text"), form.get("url")].filter(v => typeof v === "string" && v).join("\n").slice(0, 20000), files: files.map((f, i) => ({ i, name: f.name.slice(0, 200), type: f.type })) };
    await cache.put("/share-target/meta", new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
    for (const [i, f] of files.entries()) await cache.put("/share-target/file/" + i, new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream" } }));
    return Response.redirect("/tickets?shared=1", 303);
  } catch { return Response.redirect("/tickets", 303); }
}
