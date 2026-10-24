import { cp, mkdir, readdir } from "node:fs/promises";
await mkdir("public/railwatch", { recursive: true });
await cp("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/railwatch/pdf.worker.min.mjs");
for (const name of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(`node_modules/pdfjs-dist/${name}`, `public/railwatch/${name}`, {recursive:true});
}
const target = "public/railwatch/ocr";
await mkdir(target, { recursive: true });
await cp("node_modules/tesseract.js/dist/worker.min.js", `${target}/worker.min.js`);
await cp("node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz", `${target}/eng.traineddata.gz`);
for (const name of await readdir("node_modules/tesseract.js-core")) {
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name)) await cp(`node_modules/tesseract.js-core/${name}`, `${target}/${name}`);
}
