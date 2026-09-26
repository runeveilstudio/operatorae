#!/usr/bin/env node
/**
 * Dev loop (docs/06 §3): symlinks the assembled extension into the CEP
 * extensions dir for the current OS. Run `npm run build` first — this expects
 * apps/panel/dist to contain the panel, manifest, .debug and operator.jsx.
 *
 *   macOS:   ~/Library/Application Support/Adobe/CEP/extensions/
 *   Windows: %APPDATA%\Adobe\CEP\extensions\
 */
import { symlink, mkdir, rm, access, lstat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const dist = path.join(repo, "apps/panel/dist");
const extId = "com.operator.panel";

function extensionsDir() {
  if (platform() === "win32") {
    return path.join(process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"), "Adobe", "CEP", "extensions");
  }
  return path.join(homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions");
}

const required = ["index.html", "operator.jsx", path.join("CSXS", "manifest.xml")];
for (const rel of required) {
  if (!existsSync(path.join(dist, rel))) {
    console.error(`[dev-install] missing ${rel} — run the full build first: npm run build`);
    process.exit(1);
  }
}

const target = path.join(extensionsDir(), extId);
await mkdir(path.dirname(target), { recursive: true });

try {
  const st = await lstat(target);
  if (st.isSymbolicLink() || st.isDirectory()) {
    await rm(target, { recursive: true, force: true });
    console.log(`[dev-install] removed previous ${target}`);
  }
} catch (e) {
  // nothing installed yet
}

try {
  await symlink(dist, target, "dir");
} catch (e) {
  // Windows without symlinks rights: fall back to a junction-ish copy hint
  console.error(`[dev-install] symlink failed (${e.code ?? e.message}).`);
  console.error("On Windows run from an elevated shell, or enable Developer Mode, then retry.");
  process.exit(1);
}

await access(target);
console.log(`[dev-install] ${dist}`);
console.log(`[dev-install]   -> ${target}`);
console.log("[dev-install] Next: npm run dev:flags  (then launch AE and open Window > Extensions > OPERATOR)");
