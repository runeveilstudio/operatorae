import type { AeCompItem, AeLayer } from "@operator/ae-types";
import { CAPABILITIES, TASK_ERROR_CODES, err } from "../core/protocol.js";
import { isComp, type Handler, type HandlerCtx } from "../core/operator.js";
import { optNum, optStr, requireEnum, requireNum, requireObj } from "../core/validate.js";

export interface RenamePattern {
  mode: "prefix" | "suffix" | "replace" | "number";
  text: string | null;
  find: string | null;
  replace: string | null;
  regex: boolean;
  start: number;
  pad: number;
}

function pad(n: number, width: number): string {
  let s = String(n);
  while (width > 1 && s.length < width) s = "0" + s;
  return s;
}

/**
 * Pure pattern applier — returns null when the pattern yields no change or
 * an empty name. Throws ARG_INVALID for a bad regex (validated at plan time,
 * before any mutation happens).
 */
export function applyPattern(name: string, index: number, p: RenamePattern): string | null {
  let next: string;
  if (p.mode === "prefix") {
    next = (p.text === null ? "" : p.text) + name;
  } else if (p.mode === "suffix") {
    next = name + (p.text === null ? "" : p.text);
  } else if (p.mode === "replace") {
    if (p.find === null || p.find === "") return null;
    if (p.regex) {
      next = name.replace(new RegExp(p.find, "g"), p.replace === null ? "" : p.replace);
    } else {
      next = name.split(p.find).join(p.replace === null ? "" : p.replace);
    }
  } else {
    next = (p.text === null ? "" : p.text) + pad(p.start + index, p.pad);
  }
  if (next === "" || next === name) return null;
  return next;
}

function readPattern(args: Record<string, unknown>): RenamePattern {
  const raw = requireObj(args, "pattern");
  const mode = requireEnum(raw, "mode", ["prefix", "suffix", "replace", "number"]);
  const pattern: RenamePattern = {
    mode: mode as RenamePattern["mode"],
    text: optStr(raw, "text"),
    find: optStr(raw, "find"),
    replace: optStr(raw, "replace"),
    regex: raw.regex === true,
    start: optNum(raw, "start", 1),
    pad: optNum(raw, "pad", 0)
  };
  if (pattern.regex && pattern.find !== null) {
    try {
      new RegExp(pattern.find, "g");
    } catch (e) {
      throw err(TASK_ERROR_CODES.ARG_INVALID, "Invalid regex pattern: " + String(e));
    }
  }
  return pattern;
}

function requireActiveComp(ctx: HandlerCtx): AeCompItem {
  const active = ctx.env.app.project.activeItem;
  if (active === null || typeof active !== "object") {
    ctx.fail("No active composition — open a comp (or use scope \"comp\" with compId).");
  }
  if (!isComp(active)) {
    ctx.fail("The active item is not a composition.");
  }
  return active as AeCompItem;
}

function findCompById(ctx: HandlerCtx, id: number): AeCompItem {
  const app = ctx.env.app;
  for (let i = 1; i <= app.project.numItems; i++) {
    const item = app.project.item(i);
    if (isComp(item) && item.id === id) return item as AeCompItem;
  }
  ctx.fail("No composition with item id " + id + " in this project.");
}

function layersForScope(ctx: HandlerCtx): { comp: AeCompItem; layers: AeLayer[] } {
  const scope = requireEnum(ctx.args, "scope", ["selection", "comp"]);
  const comp =
    scope === "selection" ? requireActiveComp(ctx) : findCompById(ctx, requireNum(ctx.args, "compId"));
  const layers: AeLayer[] = [];
  if (scope === "selection") {
    const selected = comp.selectedLayers;
    if (selected.length === 0) {
      ctx.fail('Nothing is selected in "' + comp.name + '" — select layers or use scope "comp".');
    }
    for (let i = 0; i < selected.length; i++) layers.push(selected[i]);
  } else {
    for (let i = 1; i <= comp.numLayers; i++) layers.push(comp.layer(i));
  }
  return { comp: comp, layers: layers };
}

export function layersHandlers(): Record<string, Handler> {
  return {
    renameBatch: {
      kind: "batch",
      capability: CAPABILITIES.PROJECT,
      mutating: true,
      plan: (ctx: HandlerCtx) => {
        const pattern = readPattern(ctx.args);
        const scoped = layersForScope(ctx);
        const preview: Array<{ from: string; to: string; index: number }> = [];
        let renamed = 0;
        return {
          items: scoped.layers,
          label: 'Renaming layers in "' + scoped.comp.name + '"',
          work: (item: unknown, index: number) => {
            const layer = item as AeLayer;
            const current = layer.name;
            if (layer.locked) {
              return { reason: "Layer is locked", target: current };
            }
            const next = applyPattern(current, index, pattern);
            if (next === null) {
              return {
                reason: pattern.mode === "replace" ? "No occurrences of the find string" : "Pattern produced no change",
                target: current
              };
            }
            if (ctx.dryRun) {
              preview.push({ from: current, to: next, index: layer.index });
              return;
            }
            layer.name = next;
            renamed++;
          },
          collect: (outcome) => {
            const skipped: Array<{ layer: string | null; reason: string }> = [];
            for (let i = 0; i < outcome.errors.length; i++) {
              const e = outcome.errors[i];
              if (e.code === TASK_ERROR_CODES.ITEM_SKIPPED) {
                skipped.push({
                  layer: typeof e.target === "string" ? e.target : null,
                  reason: e.message
                });
              }
            }
            return {
              comp: { id: scoped.comp.id, name: scoped.comp.name },
              scope: requireEnum(ctx.args, "scope", ["selection", "comp"]),
              dryRun: ctx.dryRun,
              total: outcome.total,
              processed: outcome.done,
              renamed: ctx.dryRun ? 0 : renamed,
              skippedCount: skipped.length,
              skipped: skipped,
              preview: ctx.dryRun ? preview : null,
              remainingAfterCancel: outcome.cancelled ? outcome.total - outcome.done : 0
            };
          }
        };
      }
    }
  };
}
