"use client";
/**
 * Offline tickets (plan 3.6). Opt-in per device: the next 72 hours of ticket PDFs are encrypted with a
 * non-extractable AES-GCM key kept in IndexedDB, so the raw key never leaves the browser's key store.
 * Entries are removed after travel and everything is wiped on sign-out. public/offline-reader.js reads
 * the same database from the offline page.
 */
const DB = "railwatch-offline", STORE = "tickets", KEYS = "keys", FLAG = "railwatch:offline-tickets";

type Entry = { id: string; journeyId: string; date: string; label: string; name: string; iv: Uint8Array; data: ArrayBuffer };
type Source = { id: string; date: string; from: string; to: string; status: string; attachments?: { id: string; name: string; type: string }[] };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { const r = run(db.transaction(store, mode).objectStore(store)); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
/** The device key, created once as non-extractable. */
async function key(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await tx<CryptoKey | undefined>(db, KEYS, "readonly", s => s.get("ticket-key") as IDBRequest<CryptoKey | undefined>);
  if (existing) return existing;
  const created = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await tx(db, KEYS, "readwrite", s => s.put(created, "ticket-key"));
  return created;
}

/** Whether offline tickets are switched on for this browser. */
export const offlineEnabled = () => { try { return localStorage.getItem(FLAG) === "1"; } catch { return false; } };
export function setOfflineEnabled(on: boolean) { try { if (on) localStorage.setItem(FLAG, "1"); else localStorage.removeItem(FLAG); } catch { /* storage unavailable */ } if (!on) void wipeOffline(); }
export const offlineSupported = () => typeof indexedDB !== "undefined" && Boolean(globalThis.crypto?.subtle);

/** Deletes every stored ticket and the device key (sign-out, or turning the feature off). */
export async function wipeOffline() { try { indexedDB.deleteDatabase(DB); } catch { /* nothing stored */ } }

/** Booked journeys travelling between today and 72 hours from now (IST dates), with their PDFs. */
export function offlineTargets(journeys: Source[], today: string, until: string) {
  return journeys.filter(j => j.status === "booked" && j.date >= today && j.date <= until).flatMap(j => (j.attachments ?? []).filter(a => a.type === "application/pdf").map(a => ({ id: a.id, name: a.name, journeyId: j.id, date: j.date, label: `${j.from} → ${j.to}` })));
}

/** Stores missing target PDFs, removes entries that are no longer targets (travelled or unbooked). */
export async function syncOffline(targets: ReturnType<typeof offlineTargets>) {
  if (!offlineEnabled() || !offlineSupported()) return 0;
  const db = await open(), k = await key(db);
  const have = await tx<IDBValidKey[]>(db, STORE, "readonly", s => s.getAllKeys());
  const want = new Set(targets.map(t => t.id));
  for (const id of have) if (!want.has(String(id))) await tx(db, STORE, "readwrite", s => s.delete(id));
  let added = 0;
  for (const t of targets) {
    if (have.includes(t.id)) continue;
    const response = await fetch(`/api/railwatch/files/${encodeURIComponent(t.id)}`, { credentials: "same-origin" });
    if (!response.ok) continue;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, await response.arrayBuffer());
    const entry: Entry = { ...t, iv, data };
    await tx(db, STORE, "readwrite", s => s.put(entry)); added++;
  }
  db.close();
  return added;
}

/** Number of tickets currently stored on this device. */
export async function offlineCount() { if (!offlineSupported()) return 0; try { const db = await open(); const n = await tx<number>(db, STORE, "readonly", s => s.count()); db.close(); return n; } catch { return 0; } }
