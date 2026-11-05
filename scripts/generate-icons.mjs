// Regenerates the PWA icons and favicon.ico from the signal lamp mark. Run: node scripts/generate-icons.mjs
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const BRAND = "#4c4ddc", INK = "#f4f4ff";
// Signal lamp on a 48-unit grid: solid head, lit top lens and dimmed lower lens cut in the tile colour, stem and base.
const mark = () => `<rect x="16" y="6" width="16" height="28" rx="8" fill="${INK}"/><circle cx="24" cy="14" r="4.2" fill="${BRAND}"/><circle cx="24" cy="26" r="4.2" fill="${BRAND}" opacity=".35"/><rect x="22.5" y="34" width="3" height="8" rx="1.5" fill="${INK}"/><rect x="15" y="41" width="18" height="3" rx="1.5" fill="${INK}"/>`;
// glyph: fraction of the tile the 48-unit mark spans; rounded: tile corner radius in px (0 = full bleed for maskable/iOS).
const tile = (size, glyph, rounded) => {
  const scale = (size * glyph) / 48, offset = (size - 48 * scale) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${rounded}" fill="${BRAND}"/><g transform="translate(${offset} ${offset}) scale(${scale})">${mark()}</g></svg>`);
};
const png = (svg) => sharp(svg).png().toBuffer();

await writeFile("public/icons/app-192.png", await png(tile(192, 0.82, 42)));
await writeFile("public/icons/app-512.png", await png(tile(512, 0.82, 112)));
// Maskable icons must keep the glyph inside the central 80% safe zone.
await writeFile("public/icons/app-maskable-512.png", await png(tile(512, 0.62, 0)));
await writeFile("public/icons/apple-touch-icon.png", await png(tile(180, 0.78, 0)));

// favicon.ico holding PNG entries (supported by every current browser).
const sizes = [16, 32, 48], images = await Promise.all(sizes.map((s) => png(tile(s, 0.96, s / 4))));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => { const e = 6 + 16 * i; header.writeUInt8(s, e); header.writeUInt8(s, e + 1); header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6); header.writeUInt32LE(images[i].length, e + 8); header.writeUInt32LE(offset, e + 12); offset += images[i].length; });
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));
