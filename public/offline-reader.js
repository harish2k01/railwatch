/* Offline ticket reader for /offline.html (plan 3.6, canvas OfflineTicketMobile.dc.html). Reads tickets the
   app stored in IndexedDB, decrypts them with the device's non-extractable key and shows them locally. Nothing is sent. */
(function () {
  const main = document.getElementById("offline-ticket"), empty = document.getElementById("offline-empty"), status = document.getElementById("offline-status");
  if (!main || !("indexedDB" in self) || !self.crypto?.subtle) return;
  const day = (iso, opts) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", opts);
  const el = (tag, attrs, ...kids) => { const n = document.createElement(tag); Object.assign(n, attrs || {}); n.append(...kids); return n; };
  const req = indexedDB.open("railwatch-offline", 1);
  req.onupgradeneeded = () => { req.transaction.abort(); };
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains("tickets")) return;
    const all = db.transaction("tickets").objectStore("tickets").getAll();
    all.onsuccess = () => {
      const tickets = all.result.sort((a, b) => a.date.localeCompare(b.date));
      if (!tickets.length) return;
      const decrypt = (t) => new Promise((resolve, reject) => {
        const k = db.transaction("keys").objectStore("keys").get("ticket-key");
        k.onsuccess = () => crypto.subtle.decrypt({ name: "AES-GCM", iv: t.iv }, k.result, t.data).then((plain) => resolve(URL.createObjectURL(new Blob([plain], { type: "application/pdf" }))), reject);
        k.onerror = reject;
      });
      const show = (t) => {
        main.replaceChildren();
        const when = day(t.date, { weekday: "short", day: "numeric", month: "short" }) + (t.departure ? " · departs " + t.departure : "");
        const field = (label, value) => el("div", {}, el("dt", { textContent: label }), el("dd", { textContent: value || "—" }));
        main.append(el("section", { className: "card", ariaLabel: "Ticket summary" },
          el("div", { className: "top" }, el("span", { className: "muted", textContent: when }), el("span", { className: "pill", textContent: "Booked" })),
          el("h1", { textContent: t.label }),
          el("dl", {}, field("PNR", t.pnr), field("Train", t.train), field("Coach", t.coach), field("Berth", t.berth))));
        const pdf = el("button", { type: "button", className: "pdf", ariaLabel: "Original ticket" }, el("b", { textContent: "Original e-ticket PDF" }), el("small", { textContent: "Pinch to zoom · show to the TTE" }));
        pdf.addEventListener("click", () => decrypt(t).then((url) => window.open(url, "_blank")).catch(() => { pdf.replaceChildren(el("b", { textContent: "This ticket couldn’t be opened." })); }));
        main.append(pdf);
        decrypt(t).then((url) => { const frame = el("iframe", { title: "Original e-ticket PDF", src: url }); const wrap = el("section", { className: "pdf", ariaLabel: "Original ticket" }, frame); pdf.replaceWith(wrap); }).catch(() => {});
        main.append(el("span", { className: "muted foot", textContent: "Saved encrypted on this device until " + day(t.date, { day: "numeric", month: "short" }) + "." }));
        const rest = tickets.filter((x) => x !== t);
        if (rest.length) { const list = el("div", { className: "others", ariaLabel: "Other tickets on this device" }); for (const x of rest) { const b = el("button", { type: "button", textContent: day(x.date, { weekday: "short", day: "numeric", month: "short" }) + " · " + x.label }); b.addEventListener("click", () => show(x)); list.append(b); } main.append(list); }
      };
      status.textContent = "Offline · showing the copy saved on this phone";
      empty.hidden = true; main.hidden = false; show(tickets[0]);
    };
  };
})();
