import type { AeCompItem, AeFootageItem, AeLayer, AeTextDocument } from "@operator/ae-types";
import { CAPABILITIES, TASK_ERROR_CODES } from "../core/protocol.js";
import type { Handler, HandlerCtx } from "../core/operator.js";
import { isComp } from "../core/operator.js";
import { optEnum, requireNum, requireStr } from "../core/validate.js";

/**
 * Color domain (docs/03 §12). applyHex is the palette hex picker: "#ff0044"
 * parsed to an AE [r,g,b] 0..1 triple and applied to the selection — text
 * fills via Source Text, solid-backed AV layers via the source item (which
 * recolors every layer sharing that solid, as AE itself does).
 */

/** "#f04" / "ff0044" → [r,g,b] in 0..1; null when unparseable. */
export function hexToRgb(hex: string): number[] | null {
  let s = hex;
  if (s.charAt(0) === "#") s = s.substring(1);
  if (s.length === 3) {
    s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  }
  if (s.length !== 6) return null;
  for (let i = 0; i < 6; i++) {
    const c = s.charAt(i);
    const isDigit = (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
    if (isDigit !== true) return null;
  }
  return [
    parseInt(s.substring(0, 2), 16) / 255,
    parseInt(s.substring(2, 4), 16) / 255,
    parseInt(s.substring(4, 6), 16) / 255
  ];
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

/** Resolve where a layer's color lives; `apply` mutates only when called.
 * Reading Source Text is clone-safe (value semantics), so dry-run previews
 * resolve targets without touching anything. */
function resolveColorTarget(
  layer: AeLayer,
  rgb: number[]
): { target: string; apply: () => void } | { reason: string } {
  if (layer.matchName === "ADBE Text Layer") {
    const textProps = layer.property("ADBE Text Properties");
    const docProp = textProps.property("ADBE Text Document");
    const doc = docProp.value as AeTextDocument | null;
    if (doc === null || typeof doc !== "object") {
      return { reason: "Source Text has no text document" };
    }
    return {
      target: "text fill",
      apply: () => {
        doc.fillColor = [rgb[0], rgb[1], rgb[2]];
        docProp.value = doc;
      }
    };
  }
  const source = layer.source;
  if (source !== null && typeof source === "object" && source.typeName === "Solid") {
    const solid = source as AeFootageItem;
    const main = solid.mainSource;
    if (main === null || typeof main !== "object" || typeof main.color === "undefined") {
      return { reason: "Solid source exposes no color" };
    }
    return {
      target: 'solid source "' + solid.name + '"',
      apply: () => {
        main.color = [rgb[0], rgb[1], rgb[2]];
      }
    };
  }
  return { reason: "Layer has no fill color to set (text fill or solid source required)" };
}

export function colorHandlers(): Record<string, Handler> {
  return {
    applyHex: {
      kind: "batch",
      capability: CAPABILITIES.PROJECT,
      mutating: true,
      plan: (ctx: HandlerCtx) => {
        const hex = requireStr(ctx.args, "hex");
        const rgb = hexToRgb(hex);
        if (rgb === null) {
          ctx.fail("Invalid hex color \"" + hex + "\" — expected #rgb or #rrggbb", TASK_ERROR_CODES.ARG_INVALID);
        }
        const scope = optEnum(ctx.args, "scope", ["selection", "comp"], "selection");
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

        const preview: Array<{ layer: string; target: string }> = [];
        let applied = 0;
        return {
          items: layers,
          label: 'Applying ' + hex + ' in "' + comp.name + '"',
          work: (raw: unknown) => {
            const layer = raw as AeLayer;
            const resolved = resolveColorTarget(layer, rgb);
            if (typeof (resolved as { reason?: string }).reason === "string") {
              return { reason: (resolved as { reason: string }).reason, target: layer.name };
            }
            const target = resolved as { target: string; apply: () => void };
            if (ctx.dryRun) {
              preview.push({ layer: layer.name, target: target.target });
              return;
            }
            target.apply();
            applied++;
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
              hex: hex,
              rgb: rgb,
              comp: { id: comp.id, name: comp.name },
              scope: scope,
              dryRun: ctx.dryRun,
              total: outcome.total,
              processed: outcome.done,
              applied: ctx.dryRun ? 0 : applied,
              skippedCount: skipped.length,
              skipped: skipped,
              preview: ctx.dryRun ? preview : null
            };
          }
        };
      }
    }
  };
}
