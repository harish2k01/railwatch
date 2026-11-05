// Regenerates the PWA icons and favicon.ico from the Signal clock mark. Run: node scripts/generate-icons.mjs
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const mark = (stroke, lamp, width = 2) => `<g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"><circle cx="11" cy="13" r="8.5"/><path d="M11 13V7.5M11 13l-4.2 2.4"/><circle cx="19.5" cy="4.5" r="2.6" fill="${lamp}" stroke="none"/></g>`;
// glyph: fraction of the tile the 24-unit mark spans; rounded: tile corner radius in px (0 = full bleed for maskable/iOS).
const tile = (size, glyph, rounded) => {
  const scale = (size * glyph) / 24, offset = (size - 24 * scale) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${rounded}" fill="#ff8a3d"/><g transform="translate(${offset} ${offset}) scale(${scale})">${mark("#1a0e05", "#1a0e05", size <= 48 ? 2.6 : 2)}</g></svg>`);
};
const png = (svg) => sharp(svg).png().toBuffer();

await writeFile("public/icons/app-192.png", await png(tile(192, 0.66, 42)));
await writeFile("public/icons/app-512.png", await png(tile(512, 0.66, 112)));
// Maskable icons must keep the glyph inside the central 80% safe zone.
await writeFile("public/icons/app-maskable-512.png", await png(tile(512, 0.52, 0)));
await writeFile("public/icons/apple-touch-icon.png", await png(tile(180, 0.62, 0)));

// favicon.ico holding PNG entries (supported by every current browser).
const sizes = [16, 32, 48], images = await Promise.all(sizes.map((s) => png(tile(s, 0.74, s / 4))));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => { const e = 6 + 16 * i; header.writeUInt8(s, e); header.writeUInt8(s, e + 1); header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6); header.writeUInt32LE(images[i].length, e + 8); header.writeUInt32LE(offset, e + 12); offset += images[i].length; });
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));
