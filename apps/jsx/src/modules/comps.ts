import type { AeCompItem } from "@operator/ae-types";
import type { Handler, HandlerCtx } from "../core/operator.js";
import { isComp } from "../core/operator.js";

export function compsHandlers(): Record<string, Handler> {
  return {
    list: {
      kind: "immediate",
      run: (ctx: HandlerCtx) => {
        const app = ctx.env.app;
        const comps: Array<Record<string, unknown>> = [];
        for (let i = 1; i <= app.project.numItems; i++) {
          const item = app.project.item(i);
          if (!isComp(item)) continue;
          const comp = item as AeCompItem;
          comps.push({
            id: comp.id,
            name: comp.name,
            width: comp.width,
            height: comp.height,
            frameRate: comp.frameRate,
            duration: comp.duration,
            numLayers: comp.numLayers
          });
        }
        return { comps: comps };
      }
    }
  };
}
