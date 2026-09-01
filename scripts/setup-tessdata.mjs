// Puts the OCR runtime under public/tessdata so the browser loads it from this
// origin instead of a third-party CDN. Runs on postinstall; safe to re-run.
//
// The worker and WebAssembly cores are copied out of node_modules. The language
// model is not an npm package, so it is fetched once (~2MB) and then cached in
// the working tree.

import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "tessdata");
const core = path.join(out, "core");

const LANG = "eng.traineddata.gz";
const LANG_URL =
  "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast/eng.traineddata.gz";

async function main() {
  await mkdir(core, { recursive: true });

  const workerSrc = path.join(root, "node_modules", "tesseract.js", "dist", "worker.min.js");
  if (!existsSync(workerSrc)) {
    console.warn("[tessdata] tesseract.js not installed yet — skipping.");
    return;
  }
  await copyFile(workerSrc, path.join(out, "worker.min.js"));

  const coreSrc = path.join(root, "node_modules", "tesseract.js-core");
  for (const file of await readdir(coreSrc)) {
    if (/^tesseract-core.*\.(js|wasm)$/.test(file)) {
      await copyFile(path.join(coreSrc, file), path.join(core, file));
    }
  }

  const langPath = path.join(out, LANG);
  if (existsSync(langPath)) {
    console.log("[tessdata] language model already present.");
    return;
  }

  try {
    const res = await fetch(LANG_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(langPath, Buffer.from(await res.arrayBuffer()));
    console.log("[tessdata] downloaded the English language model.");
  } catch (err) {
    // Not fatal: everything but screenshot analysis still works, and a later
    // install (or a manual download) fills it in.
    console.warn(
      `[tessdata] could not download ${LANG} (${err.message}). ` +
        `Screenshot analysis will not work until it exists at public/tessdata/${LANG} — ` +
        `fetch it from ${LANG_URL}`,
    );
  }
}

main().catch((err) => {
  console.warn("[tessdata] setup skipped:", err.message);
});
