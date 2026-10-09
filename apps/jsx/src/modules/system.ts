import { CAPABILITIES, PROTOCOL_VERSION, TASK_ERROR_CODES } from "../core/protocol.js";
import type { Handler, HandlerCtx } from "../core/operator.js";
import { decodeProjectPath } from "../core/operator.js";
import { requireStr } from "../core/validate.js";
import { stringify, parse } from "../core/json.js";

export function systemHandlers(): Record<string, Handler> {
  return {
    ping: {
      kind: "immediate",
      run: (_ctx: HandlerCtx) => ({
        pong: true,
        protocol: PROTOCOL_VERSION,
        engine: "ExtendScript"
      })
    },
    probe: {
      kind: "immediate",
      run: (ctx: HandlerCtx) => {
        const p = ctx.probe;
        return {
          engine: p.engine,
          appVersion: p.appVersion,
          platform: p.platform,
          projectPath: decodeProjectPath(ctx.env.app.project.fileURI),
          capabilities: p.capabilities,
          capabilityKeys: {
            project: CAPABILITIES.PROJECT,
            undoGroups: CAPABILITIES.UNDO_GROUPS,
            scheduleTask: CAPABILITIES.SCHEDULE_TASK,
            activeComp: CAPABILITIES.ACTIVE_COMP,
            events: CAPABILITIES.EVENTS
          }
        };
      }
    },
    /**
     * Scripting console (docs/03 §13, docs/05 Phase 1): evaluates one snippet
     * against the AE DOM inside a single undo group so side effects are one
     * Ctrl+Z away. Results round-trip through the JSON bridge — host objects
     * that cannot serialize degrade to a display string, never a failed task.
     */
    eval: {
      kind: "immediate",
      mutating: true,
      run: (ctx: HandlerCtx) => {
        // Snippets address the AE DOM as `app` (the ExtendScript global). On
        // real AE ctx.env.app IS that global; everywhere else this local
        // binding makes the identifier resolvable inside the direct eval.
        const app = ctx.env.app;
        void app;
        const code = requireStr(ctx.args, "code");
        if (code === "") {
          ctx.fail("No code to evaluate", TASK_ERROR_CODES.ARG_INVALID);
        }
        let result: unknown;
        try {
          result = eval(code);
        } catch (e) {
          ctx.fail("Console error: " + String(e), TASK_ERROR_CODES.HOST_ERROR);
        }
        let display: string;
        if (result === undefined) display = "undefined";
        else if (result === null) display = "null";
        else display = String(result);
        let safe: unknown = null;
        try {
          safe = result === undefined ? null : parse(stringify(result));
        } catch (_e) {
          safe = null;
        }
        return { display: display, result: safe };
      }
    }
  };
}
