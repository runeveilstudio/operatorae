import type { Handler, HandlerCtx } from "../core/operator.js";
import { isComp, decodeProjectPath } from "../core/operator.js";

export function projectHandlers(): Record<string, Handler> {
  return {
    info: {
      kind: "immediate",
      run: (ctx: HandlerCtx) => {
        const app = ctx.env.app;
        const counts = {
          comps: 0,
          footage: 0,
          folders: 0,
          solids: 0,
          other: 0
        };
        for (let i = 1; i <= app.project.numItems; i++) {
          const item = app.project.item(i);
          if (isComp(item)) counts.comps++;
          else if (item.typeName === "Footage") counts.footage++;
          else if (item.typeName === "Folder") counts.folders++;
          else if (item.typeName === "Solid Color") counts.solids++;
          else counts.other++;
        }
        const active = app.project.activeItem;
        return {
          itemCount: app.project.numItems,
          counts: counts,
          appVersion: app.version,
          fileURI: app.project.fileURI,
          projectPath: decodeProjectPath(app.project.fileURI),
          saved: app.project.fileURI !== "",
          activeComp:
            active !== null && isComp(active)
              ? { id: active.id, name: active.name, numLayers: active.numLayers }
              : null
        };
      }
    }
  };
}
