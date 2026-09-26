import type { TaskResult } from "./task.js";

/**
 * CSXS event names on the CEP event bus (dispatched from ExtendScript via
 * PlugPlugExternalObject, received by the panel via csInterface.addEventListener).
 * `CSXSEvent.data` always carries a JSON string of the payload type below.
 */
export const TASK_PROGRESS_EVENT = "com.operator.task.progress";
export const TASK_DONE_EVENT = "com.operator.task.done";
export const HOST_CHANGED_EVENT = "com.operator.host.changed";

export const OPERATOR_EVENT_NAMES = [
  TASK_PROGRESS_EVENT,
  TASK_DONE_EVENT,
  HOST_CHANGED_EVENT
] as const;

export interface TaskProgressPayload {
  taskId: string;
  done: number;
  total: number;
  phase: "running";
  /** Optional human note, e.g. "Processing 50/1200 — Esc to cancel". */
  message?: string;
}

/** The done event carries the final TaskResult envelope verbatim. */
export type TaskDonePayload = TaskResult;
