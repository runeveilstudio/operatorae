import { homedir, platform } from "node:os";
import { join } from "node:path";

/**
 * Sidecar data dir (docs/02 §4): "~/Operator" on POSIX, "%APPDATA%\Operator"
 * on Windows. The sidecar may write (a) here, (b) the current project's
 * folder, (c) user-picked paths — nothing else (docs/02 §2.4 isolation).
 */
export function operatorDataDir(env: NodeJS.ProcessEnv = process.env): string {
  if (platform() === "win32") {
    return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Operator");
  }
  return join(homedir(), "Operator");
}
