import type { AeApplication, AeCompItem, AeItem } from "@operator/ae-types";
import {
  CAPABILITIES,
  PROTOCOL_VERSION,
  TASK_DONE_EVENT,
  TASK_ERROR_CODES,
  TASK_PROGRESS_EVENT,
  err,
  makeAccepted,
  makeFail,
  makeOk,
  type HostProbe,
  type TaskError,
  type TaskMeta,
  type TaskRequest,
  type TaskResult
} from "./protocol.js";
import { parse, stringify } from "./json.js";
import { isTaskError } from "./validate.js";

/**
 * The task engine (docs/02 §2.3). One dispatcher: immediate handlers answer
 * synchronously inside the evalScript call; batch handlers are chunked —
 * each slice runs <16ms, reports progress, then re-schedules through the
 * injected `scheduleTick` (app.scheduleTask in AE, timers in-process).
 * Mutating tasks are wrapped in a single undo group held open across chunks.
 */

export interface OperatorEnv {
  app: AeApplication;
  platform: string;
  eventsAvailable: boolean;
  emit(type: string, payloadJson: string): void;
  scheduleTick(taskId: string, continueFn: () => void): void;
  now(): number;
}

export interface HandlerCtx {
  taskId: string;
  args: Record<string, unknown>;
  meta: TaskMeta;
  dryRun: boolean;
  env: OperatorEnv;
  probe: HostProbe;
  fail(message: string, code?: string): never;
}

export type BatchWorkResult = void | string | { reason: string; target?: string } | TaskError;

export interface BatchOutcome {
  total: number;
  done: number;
  succeeded: number;
  skipped: number;
  errors: TaskError[];
  cancelled: boolean;
  dryRun: boolean;
}

export interface BatchPlan {
  items: unknown[];
  label: string;
  work(item: unknown, index: number): BatchWorkResult;
  collect(outcome: BatchOutcome): unknown;
}

export interface ImmediateHandler {
  kind: "immediate";
  capability?: string;
  mutating?: boolean;
  run(ctx: HandlerCtx): unknown;
}

export interface BatchHandlerDef {
  kind: "batch";
  capability?: string;
  /** Defaults to true; read-only sweeps declare mutating:false. */
  mutating?: boolean;
  plan(ctx: HandlerCtx): BatchPlan;
}

export type Handler = ImmediateHandler | BatchHandlerDef;
export type HandlerTable = Record<string, Record<string, Handler>>;

interface TaskState {
  plan: BatchPlan;
  ctx: HandlerCtx;
  index: number;
  succeeded: number;
  skipped: number;
  errors: TaskError[];
  cancelled: boolean;
  undoOpened: boolean;
  startedAt: number;
  chunkSize: number;
}

export interface Operator {
  run(requestJson: string): string;
  cancel(taskId: string): boolean;
  tick(taskId: string): void;
  probe(): HostProbe;
  ping(): { pong: boolean; protocol: string; engine: string };
}

const DEFAULT_CHUNK = 50;

function message(e: unknown): string {
  if (e !== null && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return String(e);
}

function toTaskError(e: unknown): TaskError {
  if (isTaskError(e)) return e;
  return err(TASK_ERROR_CODES.HOST_ERROR, message(e));
}

export function createOperator(env: OperatorEnv, handlers: HandlerTable): Operator {
  const tasks: Record<string, TaskState> = {};
  let probeCache: HostProbe | null = null;

  function safeBool(fn: () => boolean): boolean {
    try {
      return fn() === true;
    } catch (_e) {
      return false;
    }
  }

  function probe(): HostProbe {
    if (probeCache) return probeCache;
    const caps: Record<string, boolean> = {};
    caps[CAPABILITIES.PROJECT] = safeBool(
      () => env.app.project !== null && typeof env.app.project === "object" && typeof env.app.project.numItems === "number"
    );
    caps[CAPABILITIES.UNDO_GROUPS] = safeBool(
      () => typeof env.app.beginUndoGroup === "function" && typeof env.app.endUndoGroup === "function"
    );
    caps[CAPABILITIES.SCHEDULE_TASK] = safeBool(() => typeof env.app.scheduleTask === "function");
    caps[CAPABILITIES.ACTIVE_COMP] = safeBool(
      () => env.app.project.activeItem !== null && typeof env.app.project.activeItem !== "undefined"
    );
    caps[CAPABILITIES.EVENTS] = env.eventsAvailable === true;
    probeCache = {
      engine: "ExtendScript",
      appVersion: typeof env.app.version === "string" ? env.app.version : "",
      platform: env.platform,
      projectPath: decodeProjectPath(env.app.project.fileURI),
      capabilities: caps
    };
    return probeCache;
  }

  function chunkSize(meta: TaskMeta): number {
    const n = meta.chunkSize;
    if (typeof n !== "number" || !isFinite(n)) return DEFAULT_CHUNK;
    if (n < 1) return 1;
    if (n > 1000) return 1000;
    return Math.floor(n);
  }

  function undoName(request: TaskRequest): string {
    return "OPERATOR: " + request.module + "." + request.fn;
  }

  function failEnvelope(taskId: string, code: string, msg: string): string {
    return stringify(makeFail(taskId, [err(code, msg)]));
  }

  function run(requestJson: string): string {
    const startedAt = env.now();
    let request: TaskRequest;
    try {
      const parsed = parse(requestJson);
      if (parsed === null || typeof parsed !== "object") throw new Error("not an object");
      request = parsed as TaskRequest;
    } catch (_e) {
      return failEnvelope("", TASK_ERROR_CODES.PROTOCOL, "Malformed task request JSON");
    }
    if (typeof request.id !== "string" || request.id === "") {
      return failEnvelope("", TASK_ERROR_CODES.PROTOCOL, "Task request needs a string id");
    }
    if (typeof request.module !== "string" || typeof request.fn !== "string") {
      return failEnvelope(request.id, TASK_ERROR_CODES.PROTOCOL, "Task request needs module + fn");
    }
    const moduleTable = handlers[request.module];
    if (moduleTable === null || typeof moduleTable !== "object") {
      return failEnvelope(request.id, TASK_ERROR_CODES.MODULE_NOT_FOUND, "Unknown module: " + request.module);
    }
    const handler = moduleTable[request.fn];
    if (handler === null || typeof handler !== "object") {
      return failEnvelope(request.id, TASK_ERROR_CODES.FN_NOT_FOUND, "Unknown fn: " + request.module + "." + request.fn);
    }
    if (typeof handler.capability === "string" && probe().capabilities[handler.capability] !== true) {
      return failEnvelope(
        request.id,
        TASK_ERROR_CODES.CAPABILITY_MISSING,
        'This host lacks capability "' + handler.capability + '" (feature-detected, docs/02 §2.3)'
      );
    }
    if (tasks[request.id]) {
      return failEnvelope(request.id, TASK_ERROR_CODES.DUPLICATE_ID, "Task id already running: " + request.id);
    }

    const meta: TaskMeta = request.meta === null || typeof request.meta !== "object" ? {} : request.meta;
    const ctx: HandlerCtx = {
      taskId: request.id,
      args: request.args === null || typeof request.args !== "object" ? {} : request.args,
      meta: meta,
      dryRun: meta.dryRun === true,
      env: env,
      probe: probe(),
      fail: (m: string, code?: string): never => {
        throw err(
          code === null || typeof code === "undefined" ? TASK_ERROR_CODES.ARG_INVALID : code,
          m
        );
      }
    };

    if (handler.kind === "immediate") {
      const openUndo = handler.mutating === true && ctx.dryRun !== true;
      if (openUndo) env.app.beginUndoGroup(undoName(request));
      try {
        const data = handler.run(ctx);
        if (openUndo) env.app.endUndoGroup();
        return stringify(
          makeOk(request.id, data === undefined ? null : data, {
            undoToken: openUndo ? "undo:" + request.id : null,
            durationMs: env.now() - startedAt
          })
        );
      } catch (e) {
        if (openUndo) env.app.endUndoGroup();
        return stringify(makeFail(request.id, [toTaskError(e)]));
      }
    }

    let plan: BatchPlan;
    try {
      plan = handler.plan(ctx);
    } catch (e) {
      return stringify(makeFail(request.id, [toTaskError(e)]));
    }
    if (
      plan === null ||
      typeof plan !== "object" ||
      plan.items === null ||
      typeof plan.items.length !== "number"
    ) {
      return failEnvelope(request.id, TASK_ERROR_CODES.PROTOCOL, "Batch plan must expose an items array");
    }
    const openUndo = ctx.dryRun !== true && handler.mutating !== false;
    if (openUndo) env.app.beginUndoGroup(undoName(request));
    tasks[request.id] = {
      plan: plan,
      ctx: ctx,
      index: 0,
      succeeded: 0,
      skipped: 0,
      errors: [],
      cancelled: false,
      undoOpened: openUndo,
      startedAt: startedAt,
      chunkSize: chunkSize(meta)
    };
    env.scheduleTick(request.id, () => tick(request.id));
    return stringify(makeAccepted(request.id));
  }

  function tick(taskId: string): void {
    const state = tasks[taskId];
    if (state === null || typeof state !== "object") return;
    const plan = state.plan;
    const total = plan.items.length;
    let budget = state.chunkSize;
    while (state.index < total && budget > 0 && state.cancelled !== true) {
      const item = plan.items[state.index];
      const r = runWork(plan, item, state);
      if (r === undefined || r === null) {
        state.succeeded++;
      } else if (typeof r === "string") {
        state.skipped++;
        state.errors.push(err(TASK_ERROR_CODES.ITEM_SKIPPED, r, { index: state.index }));
      } else if (
        typeof r === "object" &&
        typeof (r as TaskError).code === "string" &&
        typeof (r as TaskError).message === "string"
      ) {
        state.errors.push(r as TaskError);
      } else if (typeof r === "object" && typeof (r as { reason?: unknown }).reason === "string") {
        state.skipped++;
        state.errors.push(
          err(TASK_ERROR_CODES.ITEM_SKIPPED, (r as { reason: string }).reason, {
            target: (r as { target?: unknown }).target as string | undefined,
            index: state.index
          })
        );
      } else {
        state.errors.push(
          err(TASK_ERROR_CODES.HOST_ERROR, "Work returned an unusable outcome", { index: state.index })
        );
      }
      state.index++;
      budget--;
    }
    env.emit(
      TASK_PROGRESS_EVENT,
      stringify({
        taskId: taskId,
        done: state.index,
        total: total,
        phase: "running",
        message: plan.label + " " + state.index + "/" + total
      })
    );
    if (state.cancelled === true) {
      finalize(taskId, false);
      return;
    }
    if (state.index < total) {
      env.scheduleTick(taskId, () => tick(taskId));
      return;
    }
    finalize(taskId, true);
  }

  function runWork(plan: BatchPlan, item: unknown, state: TaskState): BatchWorkResult {
    try {
      return plan.work(item, state.index);
    } catch (e) {
      return err(TASK_ERROR_CODES.HOST_ERROR, message(e), { index: state.index });
    }
  }

  function finalize(taskId: string, completed: boolean): void {
    const state = tasks[taskId];
    if (state === null || typeof state !== "object") return;
    if (state.undoOpened) {
      try {
        env.app.endUndoGroup();
      } catch (_e) {
        // undo bookkeeping must never mask the task result
      }
    }
    const outcome: BatchOutcome = {
      total: state.plan.items.length,
      done: state.index,
      succeeded: state.succeeded,
      skipped: state.skipped,
      errors: state.errors,
      cancelled: completed !== true,
      dryRun: state.ctx.dryRun
    };
    let data: unknown = null;
    try {
      data = state.plan.collect(outcome);
    } catch (e) {
      outcome.errors.push(err(TASK_ERROR_CODES.HOST_ERROR, "collect failed: " + message(e)));
    }
    let result: TaskResult;
    if (completed === true) {
      result = makeOk(taskId, data === undefined ? null : data, {
        undoToken: state.undoOpened ? "undo:" + taskId : null,
        durationMs: env.now() - state.startedAt
      });
    } else {
      result = makeFail(
        taskId,
        [
          err(
            TASK_ERROR_CODES.CANCELLED,
            "Cancelled after " + outcome.done + "/" + outcome.total + " items; one undo step reverts the partial batch"
          )
        ],
        data
      );
    }
    delete tasks[taskId];
    env.emit(TASK_DONE_EVENT, stringify(result));
  }

  function cancel(taskId: string): boolean {
    const state = tasks[taskId];
    if (state === null || typeof state !== "object" || state.cancelled === true) return false;
    state.cancelled = true;
    return true;
  }

  return {
    run: run,
    cancel: cancel,
    tick: tick,
    probe: probe,
    ping: () => ({ pong: true, protocol: PROTOCOL_VERSION, engine: "ExtendScript" })
  };
}

/** Decode an AE fileURI ("file:///a/b%20c/proj.aep") to a plain path. */
export function decodeProjectPath(fileURI: string): string | null {
  if (typeof fileURI !== "string" || fileURI === "") return null;
  let s = fileURI;
  if (s.indexOf("file://") === 0) s = s.substring("file://".length);
  try {
    return decodeURIComponent(s);
  } catch (_e) {
    return s;
  }
}

/** Shared comp lookup helper (typeName check is the documented way, docs/ae-types). */
export function isComp(item: AeItem): item is AeCompItem {
  return item.typeName === "Composition";
}
