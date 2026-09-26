import type { TaskProgressPayload, TaskRequest, TaskResult } from "@operator/protocol";

/**
 * The strategic seam (docs/02 §1): UI and command logic never touch CSInterface
 * directly — they talk to a HostAdapter. CEPHostAdapter is today's
 * implementation; a UXPHostAdapter is the future one, not a rewrite.
 */

export interface HostInfo {
  /** Host app id, e.g. "AEFT" (After Effects) or "MOCK" for dev mode. */
  host: string;
  appVersion: string;
  platform: string;
  /** Capability probe results (docs/01 principle 4: feature-detect). */
  capabilities: Record<string, boolean>;
  /** Current project path (decoded), or null when no project is open/saved. */
  projectPath?: string | null;
  /** CEP Node sidecar available (docs/02 §7 degradation ladder). */
  nodeAvailable: boolean;
  ceVersion?: string;
}

export interface RunTaskOptions {
  /** Per-run override of the adapter's task timeout (ms). 0 = no timeout. */
  timeoutMs?: number;
}

export interface HostAdapter {
  info(): Promise<HostInfo>;
  /**
   * Resolves with the task's final result envelope (ok:false included —
   * rejections are reserved for transport failures: eval errors, timeouts).
   */
  runTask(request: TaskRequest, opts?: RunTaskOptions): Promise<TaskResult>;
  /** Cooperative cancel; resolves false when the task is unknown/already done. */
  cancelTask(taskId: string): Promise<boolean>;
  /** Subscribe to chunk progress; returns an unsubscribe function. */
  onProgress(cb: (p: TaskProgressPayload) => void): () => void;
  close(): void;
}

export interface AdapterLogger {
  warn(msg: string): void;
}

export interface AdapterOptions {
  /** Default timeout for accepted (chunked) tasks before cooperative cancel. */
  taskTimeoutMs?: number;
  logger?: AdapterLogger;
}

export const DEFAULT_TASK_TIMEOUT_MS = 300_000;
