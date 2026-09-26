import { dirname, join } from "node:path";
import { SnapshotStore, DEFAULT_ROTATION, type RotationPolicy } from "./snapshot.js";
import { operatorDataDir } from "./paths.js";

export interface OperatorSidecar {
  version: string;
  dataDir: string;
  /**
   * Snapshot store for a project: lives next to the project in
   * `<projectDir>/.operator/` (docs/02 §4). Unsaved projects fall back to
   * the sidecar data dir.
   */
  snapshotsForProject(projectPath: string): SnapshotStore;
  storeAt(root: string): SnapshotStore;
}

export function createOperatorSidecar(opts?: {
  dataDir?: string;
  operatorVersion?: string;
  rotation?: RotationPolicy;
}): OperatorSidecar {
  const version = opts?.operatorVersion ?? "0.0.0";
  const dataDir = opts?.dataDir ?? operatorDataDir();
  const rotation = opts?.rotation ?? DEFAULT_ROTATION;

  function snapshotsForProject(projectPath: string): SnapshotStore {
    if (projectPath === "") {
      return new SnapshotStore(join(dataDir, "unsaved"), version, rotation);
    }
    return new SnapshotStore(join(dirname(projectPath), ".operator"), version, rotation);
  }

  return {
    version,
    dataDir,
    snapshotsForProject,
    storeAt: (root: string) => new SnapshotStore(root, version, rotation)
  };
}
