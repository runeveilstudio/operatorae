import { CAPABILITIES, PROTOCOL_VERSION } from "../core/protocol.js";
import type { Handler, HandlerCtx } from "../core/operator.js";
import { decodeProjectPath } from "../core/operator.js";

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
    }
  };
}
