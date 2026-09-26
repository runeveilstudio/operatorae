/**
 * Copies the ES3 runtime bundle next to the panel build so the extension
 * folder is complete: dist/CSXS/manifest.xml + dist/index.html + operator.jsx.
 * dev-install.mjs symlinks this folder into the CEP extensions dir.
 */
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../apps/jsx/dist/operator.jsx");
const dest = path.resolve(here, "dist/operator.jsx");

try {
  await copyFile(src, dest);
  console.log("[panel] operator.jsx copied into dist/");
} catch (e) {
  console.warn("[panel] operator.jsx missing — run the full build first: npm run build");
  process.exitCode = 1;
}
