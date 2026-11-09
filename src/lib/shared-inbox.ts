/** Reads (and clears) what was shared to RailWatch through the installed app's share sheet (see public/sw.js). */
export async function takeShared(): Promise<{ text: string; files: File[] } | undefined> {
  if (typeof caches === "undefined") return undefined;
  const cache = await caches.open("railwatch-share"), meta = await cache.match("/share-target/meta");
  if (!meta) return undefined;
  const info = await meta.json() as { text: string; files: { i: number; name: string; type: string }[] };
  const files: File[] = [];
  for (const f of info.files) { const r = await cache.match(`/share-target/file/${f.i}`); if (r) files.push(new File([await r.blob()], f.name, { type: f.type })); }
  for (const key of await cache.keys()) await cache.delete(key);
  return { text: info.text ?? "", files };
}
