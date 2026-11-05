/* Offline ticket reader for /offline.html (plan 3.6). Reads tickets the app stored in IndexedDB,
   decrypts them with the device's non-extractable key and opens them as local blobs. Nothing is sent. */
(function () {
  const list = document.getElementById("offline-tickets");
  if (!list || !("indexedDB" in self) || !self.crypto?.subtle) return;
  const req = indexedDB.open("railwatch-offline", 1);
  req.onupgradeneeded = () => { req.transaction.abort(); };
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains("tickets")) return;
    const all = db.transaction("tickets").objectStore("tickets").getAll();
    all.onsuccess = () => {
      const tickets = all.result.sort((a, b) => a.date.localeCompare(b.date));
      if (!tickets.length) return;
      const heading = document.createElement("h2"); heading.textContent = "Tickets on this device"; list.before(heading);
      for (const t of tickets) {
        const button = document.createElement("button"); button.type = "button";
        button.textContent = `${t.date} · ${t.label}`;
        button.addEventListener("click", () => {
          const k = db.transaction("keys").objectStore("keys").get("ticket-key");
          k.onsuccess = async () => {
            try {
              const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: t.iv }, k.result, t.data);
              window.open(URL.createObjectURL(new Blob([plain], { type: "application/pdf" })), "_blank");
            } catch { button.textContent = "This ticket couldn’t be opened."; }
          };
        });
        const li = document.createElement("li"); li.append(button); list.append(li);
      }
    };
  };
})();
