import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SnapshotStore, createOperatorSidecar } from "../src/index.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "operator-snapshot-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("SnapshotStore v1 (Phase 0 exit criterion)", () => {
  it("writes a strict manifest and optional AEP copy", async () => {
    const store = new SnapshotStore(root, "0.0.1-test");
    const aep = join(root, "project.aep");
    await writeFile(aep, "fake aep bytes");
    const { id, manifestPath } = await store.writeSnapshot({
      projectPath: "/proj/night.aep",
      reason: "layers.renameBatch",
      items: [{ id: 1, name: "MAIN", type: "Composition" }],
      copyFrom: aep
    });
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(manifest.id).toBe(id);
    expect(manifest.version).toBe(1);
    expect(manifest.reason).toBe("layers.renameBatch");
    expect(manifest.operatorVersion).toBe("0.0.1-test");
    expect(manifest.items).toEqual([{ id: 1, name: "MAIN", type: "Composition" }]);
    const copy = await readFile(join(root, "snapshots", id, "project.aep"), "utf8");
    expect(copy).toBe("fake aep bytes");
  });

  it("lists snapshots oldest-first and skips corrupt entries", async () => {
    const store = new SnapshotStore(root);
    const a = await store.writeSnapshot({ projectPath: "/p/a.aep", reason: "one" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.writeSnapshot({ projectPath: "/p/a.aep", reason: "two" });
    await mkdir(join(root, "snapshots", "garbage-dir"), { recursive: true });
    const listed = await store.listSnapshots();
    expect(listed.map((s) => s.id)).toEqual([a.id, b.id]);
  });

  it("rotates by age: 7 days default, older snapshots pruned", async () => {
    const store = new SnapshotStore(root);
    const old = await store.writeSnapshot({ projectPath: "/p/a.aep", reason: "old" });
    const fresh = await store.writeSnapshot({ projectPath: "/p/a.aep", reason: "fresh" });
    const ancient = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    await store.setMtime(old.id, ancient);
    // Age rotation keys off the manifest; backdate the manifest too.
    const manifestPath = join(root, "snapshots", old.id, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.createdAt = ancient.getTime();
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");

    const removed = await store.rotate();
    expect(removed).toBe(1);
    const remaining = await store.listSnapshots();
    expect(remaining.map((s) => s.id)).toEqual([fresh.id]);
  });

  it("rotates by size budget, oldest first", async () => {
    const store = new SnapshotStore(root, "0.0.0", { maxAgeDays: 365 * 10, maxTotalBytes: Number.MAX_SAFE_INTEGER });
    const a = await store.writeSnapshot({ projectPath: "/p/a.aep", reason: "a" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.writeSnapshot({ projectPath: "/p/a.aep", reason: "b" });
    // budget sized to hold exactly one snapshot (the newest)
    const aManifest = await readFile(join(root, "snapshots", a.id, "manifest.json"), "utf8");
    const budget = aManifest.length * 1.5;
    const trimmed = new SnapshotStore(root, "0.0.0", {
      maxAgeDays: 365 * 10,
      maxTotalBytes: budget
    });
    const removed = await trimmed.rotate();
    expect(removed).toBe(1);
    const remaining = await trimmed.listSnapshots();
    expect(remaining.map((s) => s.id)).toEqual([b.id]);
  });
});

describe("sidecar service wiring", () => {
  it("places per-project snapshots in <projectDir>/.operator (docs/02 §4)", async () => {
    const dataDir = join(root, "data");
    const sidecar = createOperatorSidecar({ dataDir });
    expect(sidecar.dataDir).toBe(dataDir);
    const projectPath = join(root, "proj", "night.aep");
    const store = sidecar.snapshotsForProject(projectPath);
    const { manifestPath } = await store.writeSnapshot({
      projectPath,
      reason: "test"
    });
    expect(manifestPath.startsWith(join(root, "proj", ".operator"))).toBe(true);
    expect(manifestPath.startsWith(dataDir)).toBe(false);

    const unsaved = sidecar.snapshotsForProject("");
    const unsavedWrite = await unsaved.writeSnapshot({ projectPath: "", reason: "unsaved" });
    expect(unsavedWrite.manifestPath.startsWith(join(dataDir, "unsaved"))).toBe(true);
  });
});
