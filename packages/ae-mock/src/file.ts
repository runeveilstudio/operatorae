import type { AeFile } from "@operator/ae-types";

/**
 * Browser-safe stand-in for AE's File object (no Node APIs — the panel's dev
 * fallback loads this in Chromium). `fsName` is the native path AE reports;
 * `absoluteURI` is the percent-encoded form used by `project.fileURI`.
 */

function toUri(fsName: string): string {
  if (fsName === "") return "";
  const withSlashes = fsName.replace(/\\/g, "/");
  const prefixed = withSlashes.startsWith("/") ? withSlashes : `/${withSlashes}`;
  return `file://${encodeURI(prefixed).replace(/#/g, "%23")}`;
}

function baseName(fsName: string): string {
  const norm = fsName.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}

export class MockFile implements AeFile {
  fsName: string;
  exists: boolean;
  absoluteURI: string;

  constructor(fsName: string, exists = true) {
    this.fsName = fsName;
    this.exists = exists;
    this.absoluteURI = toUri(fsName);
  }

  get name(): string {
    return baseName(this.fsName);
  }

  get displayName(): string {
    return baseName(this.fsName);
  }
}
