import type { AeCompItem, AeLayer } from "@operator/ae-types";
import { CAPABILITIES, TASK_ERROR_CODES, err } from "../core/protocol.js";
import { isComp, type Handler, type HandlerCtx } from "../core/operator.js";
import { optEnum, optNum, optStr, requireEnum, requireNum, requireObj, requireStr } from "../core/validate.js";

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

/**
 * Numeric-aware name comparison ("alpha_2" sorts before "alpha_10"), case-insensitive,
 * index-tie-broken so equal keys keep their current relative order.
 */
export function naturalCompare(a: string, b: string): number {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  let i = 0;
  let j = 0;
  while (i < lowerA.length && j < lowerB.length) {
    const ca = lowerA.charAt(i);
    const cb = lowerB.charAt(j);
    if (ca >= "0" && ca <= "9" && cb >= "0" && cb <= "9") {
      let ai = i;
      while (ai < lowerA.length && lowerA.charAt(ai) >= "0" && lowerA.charAt(ai) <= "9") ai++;
      let bj = j;
      while (bj < lowerB.length && lowerB.charAt(bj) >= "0" && lowerB.charAt(bj) <= "9") bj++;
      const na = lowerA.substring(i, ai);
      const nb = lowerB.substring(j, bj);
      // Same length compares lexically (== numerically for digits).
      if (na.length !== nb.length) return na.length < nb.length ? -1 : 1;
      if (na !== nb) return na < nb ? -1 : 1;
      i = ai;
      j = bj;
    } else {
      if (ca !== cb) return ca < cb ? -1 : 1;
      i++;
      j++;
    }
  }
  const restA = lowerA.length - i;
  const restB = lowerB.length - j;
  if (restA !== restB) return restA < restB ? -1 : 1;
  return 0;
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
    },

    /** Reorder the layer stack: natural name sort (asc/desc) or reverse. */
    sortBatch: {
      kind: "batch",
      capability: CAPABILITIES.PROJECT,
      mutating: true,
      plan: (ctx: HandlerCtx) => {
        const comp =
          ctx.args.compId !== undefined && ctx.args.compId !== null
            ? findCompById(ctx, requireNum(ctx.args, "compId"))
            : requireActiveComp(ctx);
        const order = optEnum(ctx.args, "order", ["name-asc", "name-desc", "reverse"], "name-asc");

        const current: AeLayer[] = [];
        for (let i = 1; i <= comp.numLayers; i++) current.push(comp.layer(i));

        const indexed: Array<{ layer: AeLayer; at: number }> = [];
        for (let i = 0; i < current.length; i++) indexed.push({ layer: current[i], at: i });
        if (order === "name-asc") {
          indexed.sort((a, b) => naturalCompare(a.layer.name, b.layer.name) || a.at - b.at);
        } else if (order === "name-desc") {
          indexed.sort((a, b) => naturalCompare(b.layer.name, a.layer.name) || a.at - b.at);
        } else {
          indexed.reverse();
        }
        const sorted: AeLayer[] = [];
        for (let i = 0; i < indexed.length; i++) sorted.push(indexed[i].layer);

        const namesOf = (ls: AeLayer[]): string[] => {
          const out: string[] = [];
          for (let i = 0; i < ls.length; i++) out.push(ls[i].name);
          return out;
        };
        const from = namesOf(current);
        const to = namesOf(sorted);
        let changed = false;
        if (from.length !== to.length) changed = true;
        else for (let i = 0; i < from.length; i++) if (from[i] !== to[i]) changed = true;

        // moveToBeginning in reverse produces the target top-to-bottom order.
        const units: AeLayer[] = [];
        for (let i = changed ? sorted.length - 1 : -1; i >= 0; i--) units.push(sorted[i]);
        let moved = 0;
        return {
          items: units,
          label: 'Sorting layers in "' + comp.name + '"',
          work: (raw: unknown) => {
            const layer = raw as AeLayer;
            if (ctx.dryRun) return;
            layer.moveToBeginning();
            moved++;
          },
          collect: (outcome) => {
            return {
              comp: { id: comp.id, name: comp.name },
              order: order,
              dryRun: ctx.dryRun,
              total: outcome.total,
              processed: outcome.done,
              moved: ctx.dryRun ? 0 : moved,
              alreadySorted: changed !== true,
              from: ctx.dryRun ? from : null,
              to: ctx.dryRun ? to : null
            };
          }
        };
      }
    },

    /** Selection helper: select layers whose names match a find/regex. */
    selectByPattern: {
      kind: "batch",
      capability: CAPABILITIES.PROJECT,
      mutating: true,
      plan: (ctx: HandlerCtx) => {
        const find = requireStr(ctx.args, "find");
        if (find === "") {
          throw err(TASK_ERROR_CODES.ARG_INVALID, 'Argument "find" must be non-empty');
        }
        const regex = ctx.args.regex === true;
        const caseSensitive = ctx.args.caseSensitive === true;
        const mode = optEnum(ctx.args, "mode", ["replace", "add"], "replace");
        let matcher: RegExp = null as unknown as RegExp;
        if (regex) {
          try {
            matcher = new RegExp(find, caseSensitive ? "" : "i");
          } catch (e) {
            throw err(TASK_ERROR_CODES.ARG_INVALID, "Invalid regex pattern: " + String(e));
          }
        }
        const findLower = caseSensitive ? find : find.toLowerCase();
        const comp =
          ctx.args.compId !== undefined && ctx.args.compId !== null
            ? findCompById(ctx, requireNum(ctx.args, "compId"))
            : requireActiveComp(ctx);

        const layers: AeLayer[] = [];
        for (let i = 1; i <= comp.numLayers; i++) layers.push(comp.layer(i));
        const preview: string[] = [];
        let selectedCount = 0;
        return {
          items: layers,
          label: 'Selecting layers in "' + comp.name + '"',
          work: (raw: unknown) => {
            const layer = raw as AeLayer;
            const name = layer.name;
            const hit = regex
              ? matcher.test(name)
              : (caseSensitive ? name : name.toLowerCase()).indexOf(findLower) !== -1;
            if (hit) {
              if (ctx.dryRun) {
                preview.push(name);
                return;
              }
              layer.selected = true;
              selectedCount++;
            } else if (mode === "replace" && ctx.dryRun !== true) {
              layer.selected = false;
            }
          },
          collect: (outcome) => {
            return {
              comp: { id: comp.id, name: comp.name },
              find: find,
              regex: regex,
              mode: mode,
              dryRun: ctx.dryRun,
              total: outcome.total,
              selected: ctx.dryRun ? 0 : selectedCount,
              preview: ctx.dryRun ? preview : null
            };
          }
        };
      }
    },

    /** Selection helper: clear the comp's selection. */
    deselectAll: {
      kind: "batch",
      capability: CAPABILITIES.PROJECT,
      mutating: true,
      plan: (ctx: HandlerCtx) => {
        const comp =
          ctx.args.compId !== undefined && ctx.args.compId !== null
            ? findCompById(ctx, requireNum(ctx.args, "compId"))
            : requireActiveComp(ctx);
        const layers: AeLayer[] = [];
        for (let i = 1; i <= comp.numLayers; i++) layers.push(comp.layer(i));
        const preview: string[] = [];
        let deselected = 0;
        return {
          items: layers,
          label: 'Deselecting layers in "' + comp.name + '"',
          work: (raw: unknown) => {
            const layer = raw as AeLayer;
            if (layer.selected !== true) return;
            if (ctx.dryRun) {
              preview.push(layer.name);
              return;
            }
            layer.selected = false;
            deselected++;
          },
          collect: (outcome) => {
            return {
              comp: { id: comp.id, name: comp.name },
              dryRun: ctx.dryRun,
              total: outcome.total,
              deselected: ctx.dryRun ? 0 : deselected,
              preview: ctx.dryRun ? preview : null
            };
          }
        };
      }
    }
  };
}
