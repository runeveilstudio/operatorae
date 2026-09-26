import { copyFile, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Snapshot store v1 (docs/02 §4, Phase 0 exit criterion): a manifest per
 * snapshot under `<root>/snapshots/<id>/manifest.json`, plus an optional AEP
 * copy. Rotation per docs/07 #16: 7 days or 2 GB per project, configurable.
 * Snapshots are restore points, NOT backups — the UI copy must say so.
 */

export const SNAPSHOT_MANIFEST_VERSION = 1;

export interface SnapshotItem {
  id?: number;
  name: string;
  type: string;
  hash?: string;
}

export interface SnapshotManifest {
  id: string;
  version: number;
  createdAt: number;
  projectPath: string;
  reason: string;
  items: SnapshotItem[];
  aepCopy: string | null;
  operatorVersion: string;
}

export interface WriteSnapshotInput {
  projectPath: string;
  reason: string;
  items?: SnapshotItem[];
  /** Absolute path of the AEP to copy (pre-op safety copy). */
  copyFrom?: string | null;
}

export interface RotationPolicy {
  maxAgeDays: number;
  maxTotalBytes: number;
}

export const DEFAULT_ROTATION: RotationPolicy = {
  maxAgeDays: 7,
  maxTotalBytes: 2 * 1024 * 1024 * 1024
};

export interface WriteSnapshotResult {
  id: string;
  manifestPath: string;
}

function nowId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}

export class SnapshotStore {
  constructor(
    private readonly root: string,
    private readonly operatorVersion = "0.0.0",
    private policy: RotationPolicy = DEFAULT_ROTATION
  ) {}

  private snapshotsDir(): string {
    return join(this.root, "snapshots");
  }

  async writeSnapshot(input: WriteSnapshotInput): Promise<WriteSnapshotResult> {
    const id = nowId();
    const dir = join(this.snapshotsDir(), id);
    await mkdir(dir, { recursive: true });
    let aepCopy: string | null = null;
    if (input.copyFrom) {
      const dest = join(dir, "project.aep");
      await copyFile(input.copyFrom, dest);
      aepCopy = dest;
    }
    const manifest: SnapshotManifest = {
      id,
      version: SNAPSHOT_MANIFEST_VERSION,
      createdAt: Date.now(),
      projectPath: input.projectPath,
      reason: input.reason,
      items: input.items ?? [],
      aepCopy,
      operatorVersion: this.operatorVersion
    };
    const manifestPath = join(dir, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    return { id, manifestPath };
  }

  async listSnapshots(): Promise<SnapshotManifest[]> {
    let entries: string[];
    try {
      entries = await readdir(this.snapshotsDir());
    } catch (e) {
      return [];
    }
    const manifests: SnapshotManifest[] = [];
    for (const entry of entries) {
      const manifestPath = join(this.snapshotsDir(), entry, "manifest.json");
      try {
        const raw = await readFile(manifestPath, "utf8");
        manifests.push(JSON.parse(raw) as SnapshotManifest);
      } catch (e) {
        // Corrupt/partial snapshots are skipped, never fatal (docs/02 §7).
      }
    }
    manifests.sort((a, b) => a.createdAt - b.createdAt);
    return manifests;
  }

  /** Rotate: drop snapshots older than maxAgeDays, then oldest-first until
   * the total on-disk size fits maxTotalBytes. Returns the removed count. */
  async rotate(policy: RotationPolicy = this.policy): Promise<number> {
    const dir = this.snapshotsDir();
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (e) {
      return 0;
    }
    const infos: Array<{ name: string; createdAt: number; bytes: number }> = [];
    for (const name of entries) {
      const snapshotDir = join(dir, name);
      try {
        const s = await stat(snapshotDir);
        if (!s.isDirectory()) continue;
        const manifestPath = join(snapshotDir, "manifest.json");
        const manifestRaw = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(manifestRaw) as SnapshotManifest;
        const bytes = await dirBytes(snapshotDir);
        infos.push({ name, createdAt: manifest.createdAt, bytes });
      } catch (e) {
        infos.push({ name, createdAt: 0, bytes: 0 }); // corrupt = oldest, pruned first
      }
    }
    infos.sort((a, b) => a.createdAt - b.createdAt);

    const ageCutoff = Date.now() - policy.maxAgeDays * 24 * 3600 * 1000;
    let totalBytes = infos.reduce((sum, i) => sum + i.bytes, 0);
    let removed = 0;
    for (const info of infos) {
      const expired = info.createdAt < ageCutoff;
      const overBudget = totalBytes > policy.maxTotalBytes;
      if (!expired && !overBudget) continue;
      await rm(join(dir, info.name), { recursive: true, force: true });
      totalBytes -= info.bytes;
      removed++;
    }
    return removed;
  }

  /** Test hook + future restore feature: backdate a snapshot's mtime. */
  async setMtime(id: string, when: Date): Promise<void> {
    await utimes(join(this.snapshotsDir(), id), when, when);
  }
}

async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += await dirBytes(p);
    else {
      const s = await stat(p);
      total += s.size;
    }
  }
  return total;
}
