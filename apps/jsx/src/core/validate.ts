import { err, TASK_ERROR_CODES, type TaskError } from "./protocol.js";

/** Hand-rolled arg validators (docs/02 §4: AJV cannot run in ExtendScript). */

type Args = Record<string, unknown>;

export function requireStr(args: Args | null | undefined, key: string): string {
  const a = args === null || typeof args !== "object" ? {} : args;
  if (typeof a[key] !== "string") {
    throw err(TASK_ERROR_CODES.ARG_INVALID, 'Argument "' + key + '" must be a string');
  }
  return a[key] as string;
}

export function optStr(args: Args | null | undefined, key: string): string | null {
  const a = args === null || typeof args !== "object" ? {} : args;
  const v = a[key];
  return typeof v === "string" ? v : null;
}

export function requireNum(args: Args | null | undefined, key: string): number {
  const a = args === null || typeof args !== "object" ? {} : args;
  const v = a[key];
  if (typeof v !== "number" || !isFinite(v)) {
    throw err(TASK_ERROR_CODES.ARG_INVALID, 'Argument "' + key + '" must be a number');
  }
  return v;
}

export function optNum(args: Args | null | undefined, key: string, def: number): number {
  const a = args === null || typeof args !== "object" ? {} : args;
  const v = a[key];
  return typeof v === "number" && isFinite(v) ? v : def;
}

export function requireEnum(args: Args | null | undefined, key: string, values: string[]): string {
  const v = requireStr(args, key);
  for (let i = 0; i < values.length; i++) {
    if (v === values[i]) return v;
  }
  throw err(
    TASK_ERROR_CODES.ARG_INVALID,
    'Argument "' + key + '" must be one of: ' + values.join(", ")
  );
}

/** Like requireEnum but falls back to `def` when the key is absent. */
export function optEnum(args: Args | null | undefined, key: string, values: string[], def: string): string {
  const a = args === null || typeof args !== "object" ? {} : args;
  const v = a[key];
  if (v === undefined || v === null) return def;
  if (typeof v !== "string") {
    throw err(TASK_ERROR_CODES.ARG_INVALID, 'Argument "' + key + '" must be one of: ' + values.join(", "));
  }
  for (let i = 0; i < values.length; i++) {
    if (v === values[i]) return v;
  }
  throw err(
    TASK_ERROR_CODES.ARG_INVALID,
    'Argument "' + key + '" must be one of: ' + values.join(", ")
  );
}

export function requireObj(args: Args | null | undefined, key: string): Args {
  const a = args === null || typeof args !== "object" ? {} : args;
  const v = a[key];
  if (v === null || typeof v !== "object" || v instanceof Array) {
    throw err(TASK_ERROR_CODES.ARG_INVALID, 'Argument "' + key + '" must be an object');
  }
  return v as Args;
}

export function isTaskError(e: unknown): e is TaskError {
  return (
    e !== null &&
    typeof e === "object" &&
    typeof (e as TaskError).code === "string" &&
    typeof (e as TaskError).message === "string"
  );
}
