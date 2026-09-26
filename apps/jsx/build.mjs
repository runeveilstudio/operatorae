/**
 * Two-pass build (docs/06 §2): tsc -b emits ES2020 CommonJS in dist-es2020
 * (done by the root build), then this script bundles to a single file and
 * lowers it to ExtendScript-compatible ES3:
 *   esbuild (bundle, iife, es5) -> babel (preset-env ie8 + ES3 literal plugins)
 *   -> prepend the #targetengine prelude -> dist/operator.jsx
 */
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { transformAsync } from "@babel/core";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PROTOCOL_VERSION } from "@operator/protocol";

const here = path.dirname(fileURLToPath(import.meta.url));
const resolve = (p) => path.resolve(here, p);

const entry = resolve("dist-es2020/index.js");
const staged = resolve("dist/.bundle.js");
const out = resolve("dist/operator.jsx");

await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  // esbuild only CONCATENATES here — all lowering to ES3 is Babel's job
  // (esbuild cannot lower const/let; see quirk extendscript.es3).
  target: "es2020",
  outfile: staged,
  logLevel: "info",
  legalComments: "none"
});

const bundled = await readFile(staged, "utf8");
const babelConfigPath = resolve("babel.config.json");
const lowered = await transformAsync(bundled, {
  cwd: here,
  configFile: babelConfigPath
});

const prelude = [
  '#targetengine "operator";',
  "// OPERATOR ExtendScript runtime — GENERATED FILE, do not edit.",
  `// Built by apps/jsx/build.mjs; task protocol ${PROTOCOL_VERSION}.`,
  "// ES3 only: no trailing commas, no reserved-word properties, no getters (quirk extendscript.es3).",
  ""
].join("\n");

await rm(staged, { force: true });
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, prelude + lowered.code, "utf8");

// ES3 smoke gate: these tokens must never survive into the bundle
// (quirk extendscript.es3 — ExtendScript has no ES5+ runtime).
const banned = [/\b=>/, /`/, /\bclass\s+\w/, /\blet\s/, /\bconst\s/, /\bfunction\s*\*/];
const hits = banned.filter((re) => re.test(lowered.code));
if (hits.length > 0) {
  console.error(`[apps/jsx] ES3 GATE FAILED — banned syntax survived: ${hits.map(String).join(", ")}`);
  process.exit(1);
}
console.log(`[apps/jsx] wrote ${out} (${lowered.code.length} bytes, ES3 gate passed)`);
