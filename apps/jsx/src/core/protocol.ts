/**
 * HAND-MIRRORED ES3 copy of the task protocol (docs/02 §2.3): ExtendScript
 * cannot import packages, so this file mirrors @operator/protocol's runtime
 * surface. test/protocol-parity.test.ts fails the build if the two drift.
 *
 * ES3 constraints enforced here (quirk extendscript.es3):
 * no trailing commas, no reserved-word property names, no getters, ASCII only.
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
  PROTOCOL: "TASK_PROTOCOL",
  ITEM_SKIPPED: "TASK_ITEM_SKIPPED"
} as const;

export const TASK_PROGRESS_EVENT = "com.operator.task.progress";
export const TASK_DONE_EVENT = "com.operator.task.done";
export const HOST_CHANGED_EVENT = "com.operator.host.changed";

export const CAPABILITIES = {
  PROJECT: "ae.project",
  UNDO_GROUPS: "ae.undoGroups",
  SCHEDULE_TASK: "ae.scheduleTask",
  ACTIVE_COMP: "ae.activeComp",
  EVENTS: "cep.plugplugEvents",
  ITEMS: "ae.items",
  LAYERS: "ae.layers",
  LAYER_TOGGLES: "ae.layerToggles",
  LAYER_LABELS: "ae.layerLabels",
  KEYFRAMES: "ae.keyframes",
  TEXT_LAYERS: "ae.textLayers",
  SHAPES: "ae.shapes",
  EFFECTS: "ae.effects",
  EXPRESSIONS: "ae.expressions",
  MARKERS: "ae.markers",
  RENDER_QUEUE: "ae.renderQueue",
  LABELS: "ae.labels",
  ESSENTIAL_PROPERTIES: "ae.essentialProperties"
} as const;

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

export interface TaskMeta {
  dryRun?: boolean;
  chunkSize?: number;
  snapshotId?: string | null;
}

export interface TaskRequest {
  id: string;
  module: TaskModuleId;
  fn: string;
  args?: Record<string, unknown> | null;
  meta?: TaskMeta | null;
}

export interface TaskError {
  code: string;
  message: string;
  target?: string;
  index?: number;
}

export interface TaskAccepted {
  accepted: true;
  taskId: string;
}

export interface TaskResult {
  taskId: string;
  ok: boolean;
  data?: unknown;
  errors?: TaskError[];
  undoToken?: string | null;
  durationMs?: number;
}

export type TaskEnvelope = TaskResult | TaskAccepted;

export interface HostProbe {
  engine: "ExtendScript";
  appVersion: string;
  platform: string;
  projectPath: string | null;
  capabilities: Record<string, boolean>;
}

export function isAccepted(env: TaskEnvelope): boolean {
  return (env as TaskAccepted).accepted === true;
}

export function makeAccepted(taskId: string): TaskAccepted {
  return { accepted: true, taskId: taskId };
}

export function makeOk(
  taskId: string,
  data?: unknown,
  opts?: { undoToken?: string | null; durationMs?: number }
): TaskResult {
  const r: TaskResult = { taskId: taskId, ok: true, data: data === undefined ? null : data };
  if (opts && typeof opts.undoToken !== "undefined") r.undoToken = opts.undoToken;
  if (opts && typeof opts.durationMs !== "undefined") r.durationMs = opts.durationMs;
  return r;
}

export function makeFail(taskId: string, errors: TaskError[], data?: unknown): TaskResult {
  const r: TaskResult = { taskId: taskId, ok: false, data: data === undefined ? null : data, errors: errors };
  return r;
}

export function err(
  code: string,
  message: string,
  extra?: { target?: string; index?: number }
): TaskError {
  const e: TaskError = { code: code, message: message };
  if (extra && typeof extra.target !== "undefined") e.target = extra.target;
  if (extra && typeof extra.index !== "undefined") e.index = extra.index;
  return e;
}
