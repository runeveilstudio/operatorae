/**
 * OPERATOR task protocol (docs/02 §2.3).
 *
 * The single wire contract between the panel (command core) and the
 * ExtendScript runtime. Every crossing of that boundary is a TaskRequest in,
 * TaskResult out — strict JSON both ways, never string interpolation.
 *
 * NOTE: apps/jsx carries a hand-mirrored ES3 copy of this shape
 * (apps/jsx/src/core/protocol.ts) because ExtendScript cannot import packages.
 * `apps/jsx/test/protocol-parity.test.ts` enforces the two stay in sync.
 */

/**
 * Every domain in docs/03 has a runtime module (docs/02 §2.3 module map).
 * Adding a module here requires the matching handler table in apps/jsx
 * (`handlerTable()`), the ES3 mirror, and the tools/schema enum to agree.
 */
export type TaskModuleId =
  | "system"
  | "project"
  | "assets"
  | "comps"
  | "layers"
  | "keys"
  | "text"
  | "shapes"
  | "effects"
  | "expressions"
  | "data"
  | "render"
  | "timeline"
  | "color"
  | "snapshot"
  | "ops";

export const TASK_MODULE_IDS: readonly TaskModuleId[] = [
  "system",
  "project",
  "assets",
  "comps",
  "layers",
  "keys",
  "text",
  "shapes",
  "effects",
  "expressions",
  "data",
  "render",
  "timeline",
  "color",
  "snapshot",
  "ops"
] as const;

export interface TaskRequest {
  /** Unique per execution; used for progress/cancel correlation. */
  id: string;
  module: TaskModuleId;
  fn: string;
  /** JSON-schema-validated args (validation enforced on both ends). */
  args?: Record<string, unknown> | null;
  meta?: TaskMeta | null;
}

export interface TaskMeta {
  /** Preview mode: compute what would happen, mutate nothing. */
  dryRun?: boolean;
  /** Items processed per slice before yielding to the AE UI thread. */
  chunkSize?: number;
  /** Snapshot id written by the sidecar before a mutating batch (docs/02 §3-A). */
  snapshotId?: string | null;
}

export interface TaskError {
  code: TaskErrorCode | string;
  message: string;
  /** What the error applies to (layer name, item id, …) for actionable UI. */
  target?: string;
  index?: number;
}

/** Immediate acknowledgment for chunked tasks: the real result arrives on TASK_DONE_EVENT. */
export interface TaskAccepted {
  accepted: true;
  taskId: string;
}

export interface TaskResult {
  taskId: string;
  ok: boolean;
  data?: unknown;
  errors?: TaskError[];
  /** Identifies the single undo group wrapping this task (docs/02 §2.3). */
  undoToken?: string | null;
  durationMs?: number;
}

export type TaskEnvelope = TaskResult | TaskAccepted;

/**
 * Version of the task protocol itself. Bumped on any breaking change to the
 * envelope/event shapes. The panel asserts the JSX runtime reports the same
 * version at bootstrap (stale-bundle detection).
 */
export const PROTOCOL_VERSION = "0.1.0";

export const TASK_ERROR_CODES = {
  CANCELLED: "TASK_CANCELLED",
  UNKNOWN_TASK: "TASK_UNKNOWN_TASK",
  DUPLICATE_ID: "TASK_DUPLICATE_ID",
  MODULE_NOT_FOUND: "TASK_MODULE_NOT_FOUND",
  FN_NOT_FOUND: "TASK_FN_NOT_FOUND",
  ARG_INVALID: "TASK_ARG_INVALID",
  CAPABILITY_MISSING: "TASK_CAPABILITY_MISSING",
  HOST_ERROR: "TASK_HOST_ERROR",
  /** A single batch item was intentionally skipped (locked layer, no change). */
  ITEM_SKIPPED: "TASK_ITEM_SKIPPED",
  PROTOCOL: "TASK_PROTOCOL"
} as const;

export type TaskErrorCode = (typeof TASK_ERROR_CODES)[keyof typeof TASK_ERROR_CODES];

export function makeAccepted(taskId: string): TaskAccepted {
  return { accepted: true, taskId };
}

export function isAccepted(env: TaskEnvelope): env is TaskAccepted {
  return (env as TaskAccepted).accepted === true;
}

export function makeOk(
  taskId: string,
  data?: unknown,
  opts?: { undoToken?: string | null; durationMs?: number }
): TaskResult {
  const r: TaskResult = { taskId, ok: true, data: data === undefined ? null : data };
  if (opts?.undoToken !== undefined) r.undoToken = opts.undoToken;
  if (opts?.durationMs !== undefined) r.durationMs = opts.durationMs;
  return r;
}

export function makeFail(taskId: string, errors: TaskError[], data?: unknown): TaskResult {
  const r: TaskResult = { taskId, ok: false, data: data === undefined ? null : data, errors };
  return r;
}

export function err(
  code: TaskErrorCode | string,
  message: string,
  extra?: { target?: string; index?: number }
): TaskError {
  const e: TaskError = { code, message };
  if (extra?.target !== undefined) e.target = extra.target;
  if (extra?.index !== undefined) e.index = extra.index;
  return e;
}
