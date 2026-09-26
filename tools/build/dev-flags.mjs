#!/usr/bin/env node
/**
 * Enables PlayerDebugMode so unsigned dev extensions load (docs/06 §3).
 * Sets the flag for the CEP majors we support (11 and 12) on both OSes.
 */
import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const CEP_MAJORS = ["CSXS.11", "CSXS.12"];

function enable(dottedPref) {
  if (platform() === "win32") {
    for (const view of ["HKCU"]) {
      execFileSync("reg", [
        "add",
        `${view}\\Software\\Adobe\\${dottedPref}`,
        "/v",
        "PlayerDebugMode",
        "/t",
        "REG_SZ",
        "/d",
        "1",
        "/f"
      ], { stdio: "inherit" });
    }
  } else {
    execFileSync("defaults", ["write", `com.adobe.${dottedPref}`, "PlayerDebugMode", "1"], {
      stdio: "inherit"
    });
  }
}

for (const major of CEP_MAJORS) {
  try {
    enable(major);
    console.log(`[dev-flags] PlayerDebugMode=1 for ${major}`);
  } catch (e) {
    console.warn(`[dev-flags] could not set ${major} (${e.message}) — AE may not be installed yet`);
  }
}
console.log("[dev-flags] done — dev panels will load unsigned extensions.");
