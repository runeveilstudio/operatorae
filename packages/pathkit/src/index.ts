/**
 * Cross-OS path rules (docs/04 §3), enforced everywhere paths exist:
 *  - one canonical internal form: POSIX-style segments with a leading root
 *    ("C:/x/y", "//server/share/x", "/Users/x", or rootless relative);
 *  - OS-native strings only at the edges;
 *  - case-insensitive comparison by default (Windows/FAT/APFS-default), with
 *    hash matching authoritative for relink (docs/04 §3 rule 3).
 *
 * Pure functions: the caller states the platform flavor; nothing sniffs
 * process/env, so this is unit-testable everywhere.
 */

export type PathPlatform = "posix" | "windows";

export interface CanonicalPath {
  path: string;
  /** Root prefix: "C:", "\\\\server\\share" form for UNC, or "" when rootless. */
  root: string;
  rootless: boolean;
  platform: PathPlatform;
}

export function detectPlatform(p: string): PathPlatform {
  if (p === "") return "posix";
  if (/^[A-Za-z]:[\\/]/.test(p)) return "windows";
  if (p.startsWith("\\\\") || p.startsWith("//")) return "windows";
  return "posix";
}

export function normalize(p: string): string {
  let s = p.replace(/\\/g, "/");
  if (s.startsWith("//")) s = "//" + s.slice(2).replace(/\/+/g, "/");
  else s = s.replace(/\/+/g, "/");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

export function toCanonical(p: string): CanonicalPath {
  const platform = detectPlatform(p);
  const norm = normalize(p);
  let root = "";
  if (platform === "windows") {
    const drive = norm.match(/^([A-Za-z]:)(\/.*)?$/);
    const unc = norm.match(/^(\/\/[^/]+\/[^/]+)(\/.*)?$/);
    if (drive) {
      root = drive[1];
    } else if (unc) {
      root = unc[1].replace(/\//g, "\\");
    }
  } else if (norm.startsWith("/")) {
    root = "/";
  }
  return {
    path: norm === "" ? "." : norm,
    root: root,
    rootless: root === "" && norm !== "." && norm !== "",
    platform: platform
  };
}

export function join(...segments: string[]): string {
  const joined = normalize(segments.filter((s) => s !== "").join("/"));
  return joined === "" ? "." : joined;
}

export function basename(p: string): string {
  const norm = normalize(p);
  if (norm === "." || norm === "/") return "";
  const parts = norm.split("/");
  return parts[parts.length - 1] ?? "";
}

export function dirname(p: string): string {
  const norm = normalize(p);
  const idx = norm.lastIndexOf("/");
  if (idx === -1) return ".";
  if (idx === 0) return "/";
  return norm.slice(0, idx);
}

export function extension(p: string): string {
  const b = basename(p);
  const dot = b.lastIndexOf(".");
  if (dot <= 0) return "";
  return b.slice(dot);
}

/** Docs/04 §3 rule 3: case-insensitive by default; explicit opt-out for
 * strict POSIX volumes where an exact-case match is preferred. */
export function samePath(a: string, b: string, caseSensitive = false): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (caseSensitive) return na === nb;
  return na.toLowerCase() === nb.toLowerCase();
}

/**
 * Windows >260 char safe form for sidecar fs calls (docs/04 §3 rule 6):
 * "C:/a/b" -> "\\\\?\\C:\\a\\b" and "//server/share/a" -> "\\\\?\\UNC\\server\\share\\a".
 * Note: the runtime VALUES contain single backslashes; the TS literals below
 * escape them ("\\\\" in source is one backslash in the value).
 */
export function toWindowsExtended(p: string): string {
  if (detectPlatform(p) !== "windows") return p;
  const withBackslashes = normalize(p).replace(/\//g, "\\");
  if (/^[A-Za-z]:/.test(withBackslashes)) return "\\\\?\\" + withBackslashes;
  if (withBackslashes.startsWith("\\\\")) return "\\\\?\\UNC" + withBackslashes.slice(1);
  return p;
}

export function toNative(p: string): string {
  const platform = detectPlatform(p);
  const norm = normalize(p);
  if (platform === "windows") return norm.replace(/\//g, "\\");
  return norm;
}
