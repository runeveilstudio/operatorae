import type { AeApplication, AeFile } from "@operator/ae-types";
import { createPlugPlugEventSink } from "../core/events.js";
import type { OperatorEnv } from "../core/operator.js";
import { stringify } from "../core/json.js";

/**
 * Production env: PlugPlug events for progress, app.scheduleTask code
 * strings for chunk continuation (quirk ae.scheduletask-takes-code-string).
 * The tick registry is keyed by task id so AE's string-evaluated continuation
 * can find the right closure in this session engine.
 */
export interface AeEnvHandle {
  env: OperatorEnv;
  fireTick(taskId: string): boolean;
}

/** ExtendScript's File constructor. Tests type a DOM File too; the cast keeps
 * only the (path) signature the runtime actually uses. */
type EsFileCtor = { new (path: string): AeFile };
const EsFile = File as unknown as EsFileCtor;

export function createAeEnv(app: AeApplication, platform: string): AeEnvHandle {
  const ticks: Record<string, () => void> = {};
  const sink = createPlugPlugEventSink();
  function fireTick(taskId: string): boolean {
    const fn = ticks[taskId];
    if (!fn) return false;
    delete ticks[taskId];
    fn();
    return true;
  }
  const env: OperatorEnv = {
    app: app,
    platform: platform,
    eventsAvailable: sink !== null,
    emit: (type, payloadJson) => {
      if (sink) sink(type, payloadJson);
    },
    scheduleTick: (taskId, continueFn) => {
      ticks[taskId] = continueFn;
      app.scheduleTask("$._OP._tick(" + stringify(taskId) + ")", 0, false);
    },
    now: () => new Date().getTime(),
    makeFile: (fsName) => new EsFile(fsName)
  };
  return { env: env, fireTick: fireTick };
}
