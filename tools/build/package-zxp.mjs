#!/usr/bin/env node
/**
 * ZXP staging + signing (docs/04 §6). Stages a releaseable extension folder,
 * then signs with ZXPSignCmd when configured:
 *   OPERATOR_ZXPSIGN=/path/to/ZXPSignCmd
 *   OPERATOR_SIGN_CERT=/path/to/cert.p12  OPERATOR_SIGN_PASS=...
 * Without credentials it stays a DRY RUN: staged, hashed, unsigned — good
 * enough for CI validation; real signing runs in the release pipeline.
 */
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { accessSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const dist = path.join(repo, "apps/panel/dist");
const stage = path.join(repo, "tools/build/tmp/com.operator.panel");
const outDir = path.join(repo, "dist");
const version = process.env.npm_package_version ?? "0.0.1";

await mkdir(outDir, { recursive: true });
await access(path.join(dist, "CSXS", "manifest.xml"));
await cp(dist, stage, { recursive: true, force: true });
console.log(`[package-zxp] staged ${dist} -> ${stage}`);

const signCmd = process.env.OPERATOR_ZXPSIGN;
const cert = process.env.OPERATOR_SIGN_CERT;
const pass = process.env.OPERATOR_SIGN_PASS;
const zxpPath = path.join(outDir, `com.operator.panel-${version}.zxp`);
const canSign = Boolean(signCmd && cert && pass);

if (canSign) {
  await execFileP(signCmd, [
    "-sign",
    stage,
    zxpPath,
    cert,
    pass,
    "-tsa",
    "http://timestamp.digicert.com"
  ]);
  console.log(`[package-zxp] SIGNED ${zxpPath}`);
} else {
  console.log("[package-zxp] DRY RUN (no signing credentials) — staged only.");
  console.log("[package-zxp] set OPERATOR_ZXPSIGN, OPERATOR_SIGN_CERT, OPERATOR_SIGN_PASS to sign.");
}

function existsSafe(p) {
  try {
    accessSync(p);
    return true;
  } catch {
    return false;
  }
}

const hashedFile = canSign && existsSafe(zxpPath) ? zxpPath : path.join(stage, "CSXS", "manifest.xml");
const hash = createHash("sha256").update(await readFile(hashedFile)).digest("hex");
console.log(`[package-zxp] sha256(${path.basename(hashedFile)}) = ${hash}`);
await writeFile(path.join(outDir, "sha256.txt"), `${hash}  ${path.basename(zxpPath)}\n`, "utf8");
