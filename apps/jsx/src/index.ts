import type { AeApplication } from "@operator/ae-types";
import { createOperator, type HandlerTable } from "./core/operator.js";
import { createAeEnv } from "./env/ae-env.js";
import { systemHandlers } from "./modules/system.js";
import { projectHandlers } from "./modules/project.js";
import { compsHandlers } from "./modules/comps.js";
import { layersHandlers } from "./modules/layers.js";
import { doctorHandlers } from "./modules/doctor.js";
import { stringify } from "./core/json.js";

export function handlerTable(): HandlerTable {
  return {
    system: systemHandlers(),
    project: projectHandlers(),
    comps: compsHandlers(),
    layers: layersHandlers(),
    assets: doctorHandlers()
  };
}

export interface OperatorGlobal {
  /** evalScript entry: TaskRequest JSON in, TaskEnvelope JSON out. */
  run(requestJson: string): string;
  cancel(taskId: string): string;
  probe(): string;
  ping(): string;
  /** AE scheduleTask continuation — addresses the tick registry by task id. */
  _tick(taskId: string): string;
}

export interface OperatorDollar {
  os?: string;
  version?: string;
  _OP?: unknown;
}

export function installOperator(dollar: OperatorDollar, aeApp: AeApplication): OperatorGlobal {
  const handle = createAeEnv(aeApp, typeof dollar.os === "string" ? dollar.os : "");
  const op = createOperator(handle.env, handlerTable());
  const api: OperatorGlobal = {
    run: (json: string) => op.run(json),
    cancel: (taskId: string) => stringify(op.cancel(taskId)),
    probe: () => stringify(op.probe()),
    ping: () => stringify(op.ping()),
    _tick: (taskId: string) => {
      handle.fireTick(taskId);
      return "";
    }
  };
  dollar._OP = api;
  return api;
}

// Auto-install into a real ExtendScript host (#targetengine "operator" is
// prepended by the build). In Node/browser contexts this is a guarded no-op.
if (typeof $ !== "undefined" && typeof app !== "undefined") {
  installOperator($, app);
}
