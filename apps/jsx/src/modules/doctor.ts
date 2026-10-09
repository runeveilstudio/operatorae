import type { AeCompItem, AeEffect, AeFolderItem, AeItem, AeLayer, AeProperty } from "@operator/ae-types";
import { CAPABILITIES } from "../core/protocol.js";
import { isComp, decodeProjectPath, type Handler, type HandlerCtx } from "../core/operator.js";

/**
 * Asset Doctor v1 (docs/03 §1, docs/05 Phase 1): one read-only sweep that
 * audits the whole project for missing media, unused footage and broken
 * expressions. Findings are structured for the report UI and for the fix
 * commands that come later (relink, remove-unused, expression workbench).
 *
 * Runs chunked through the batch engine with progress + cooperative cancel,
 * but declares mutating:false so no undo group is ever opened (docs/02 §2.3).
 */

export interface MissingFinding {
  itemId: number;
  name: string;
  path: string;
  folder: string;
  reason: string;
}

export interface UnusedFinding {
  itemId: number;
  name: string;
  kind: "Footage" | "Solid";
  folder: string;
}

export interface BrokenExpressionFinding {
  compId: number;
  comp: string;
  layerIndex: number;
  layer: string;
  /** Display path, e.g. "Transform > Scale". */
  path: string;
  matchName: string;
  expression: string;
  error: string;
  enabled: boolean;
}

export interface DoctorScanData {
  projectPath: string | null;
  appVersion: string;
  scanned: { items: number; comps: number; layers: number; expressions: number };
  counts: { missing: number; unused: number; brokenExpressions: number };
  missing: MissingFinding[];
  unused: UnusedFinding[];
  brokenExpressions: BrokenExpressionFinding[];
  cancelled: boolean;
  hardErrors: number;
}

type ScanUnit =
  | { kind: "item"; item: AeItem; folder: string }
  | { kind: "layer"; comp: AeCompItem; layerIndex: number };

/** Real AE exposes effects under this group inside `layer.property(i)`; the
 * mock keeps them in `layer.effect(i)` only. We skip the group and always
 * walk `effect(i)` so both hosts report each expression exactly once. */
const EFFECT_PARADE = "ADBE Effect Parade";

function safeStr(fn: () => string | undefined | null): string {
  try {
    const v = fn();
    return typeof v === "string" ? v : "";
  } catch (_e) {
    return "";
  }
}

function safeBool(fn: () => boolean | undefined | null): boolean {
  try {
    return fn() === true;
  } catch (_e) {
    return false;
  }
}

function safeNum(fn: () => number): number {
  try {
    const v = fn();
    return typeof v === "number" && isFinite(v) ? v : 0;
  } catch (_e) {
    return 0;
  }
}

/** "Folder A / Folder B" chain from the item up to the project root. */
function folderPathOf(item: AeItem): string {
  const names: string[] = [];
  let folder = item.parentFolder;
  while (folder !== null && typeof folder === "object") {
    names.push(folder.name);
    folder = folder.parentFolder;
  }
  let out = "";
  for (let i = names.length - 1; i >= 0; i--) {
    out = out === "" ? names[i] : out + " / " + names[i];
  }
  return out;
}

interface ExpressionSink {
  broken: BrokenExpressionFinding[];
  expressions: number;
}

/** Minimal structural view of any property-tree node (groups, leaves and
 * effects all satisfy it) — expression fields are optional because real
 * AE's PropertyGroup does not expose them; reads stay defensive. */
interface WalkNode {
  name: string;
  matchName: string;
  numProperties: number;
  property(nameOrIndex: number): WalkNode;
  expression?: string;
  expressionError?: string;
  expressionEnabled?: boolean;
}

function walkPropertyTree(
  node: WalkNode,
  path: string,
  comp: AeCompItem,
  layer: AeLayer,
  sink: ExpressionSink
): void {
  const expr = safeStr(() => node.expression);
  if (expr !== "") {
    sink.expressions++;
    const errorText = safeStr(() => node.expressionError);
    if (errorText !== "") {
      sink.broken.push({
        compId: comp.id,
        comp: comp.name,
        layerIndex: layer.index,
        layer: layer.name,
        path: path,
        matchName: safeStr(() => node.matchName),
        expression: expr.length > 200 ? expr.substring(0, 200) + "..." : expr,
        error: errorText,
        enabled: safeBool(() => node.expressionEnabled)
      });
    }
  }
  if (safeStr(() => node.matchName) === EFFECT_PARADE) return;
  const n = safeNum(() => node.numProperties);
  for (let i = 1; i <= n; i++) {
    let child: WalkNode | null = null;
    try {
      child = node.property(i);
    } catch (_e) {
      child = null;
    }
    if (child === null || typeof child !== "object") continue;
    walkPropertyTree(child, path === "" ? child.name : path + " > " + child.name, comp, layer, sink);
  }
}

function scanLayerExpressions(comp: AeCompItem, layer: AeLayer, sink: ExpressionSink): void {
  const groups = safeNum(() => layer.numProperties);
  for (let i = 1; i <= groups; i++) {
    let group: AeProperty | null = null;
    try {
      group = layer.property(i);
    } catch (_e) {
      group = null;
    }
    if (group === null || typeof group !== "object") continue;
    walkPropertyTree(group, group.name, comp, layer, sink);
  }
  const fxCount = safeNum(() => layer.numEffects);
  for (let e = 1; e <= fxCount; e++) {
    let fx: AeEffect | null = null;
    try {
      fx = layer.effect(e);
    } catch (_er) {
      fx = null;
    }
    if (fx === null || typeof fx !== "object") continue;
    walkPropertyTree(fx, "Effects > " + fx.name, comp, layer, sink);
  }
}

export function doctorHandlers(): Record<string, Handler> {
  return {
    doctorScan: {
      kind: "batch",
      capability: CAPABILITIES.PROJECT,
      mutating: false,
      plan: (ctx: HandlerCtx) => {
        const project = ctx.env.app.project;
        const missing: MissingFinding[] = [];
        const unused: UnusedFinding[] = [];
        const sink: ExpressionSink = { broken: [], expressions: 0 };
        const scanned = { items: 0, comps: 0, layers: 0, expressions: 0 };
        const seen: Record<string, boolean> = {};
        const comps: AeCompItem[] = [];
        const units: ScanUnit[] = [];

        // Id-deduped walk over the whole project tree. Real AE enumerates
        // only root items via project.item(i); the mock also leaks nested
        // items there — the visited set keeps both hosts at one visit.
        function visit(item: AeItem): void {
          const key = String(item.id);
          if (seen[key] === true) return;
          seen[key] = true;
          scanned.items++;
          if (isComp(item)) {
            const comp = item as AeCompItem;
            comps.push(comp);
            scanned.comps++;
            for (let i = 1; i <= comp.numLayers; i++) {
              units.push({ kind: "layer", comp: comp, layerIndex: i });
            }
          }
          units.push({ kind: "item", item: item, folder: folderPathOf(item) });
          if (item.typeName === "Folder") {
            const folder = item as AeFolderItem;
            for (let i = 1; i <= folder.numItems; i++) {
              visit(folder.item(i));
            }
          }
        }
        for (let i = 1; i <= project.numItems; i++) {
          visit(project.item(i));
        }

        // Usage set: every item referenced as a layer source in any comp.
        const used: Record<string, boolean> = {};
        for (let c = 0; c < comps.length; c++) {
          const comp = comps[c];
          for (let i = 1; i <= comp.numLayers; i++) {
            const source = comp.layer(i).source;
            if (source !== null && typeof source === "object") {
              used[String(source.id)] = true;
            }
          }
        }

        return {
          items: units,
          label: "Auditing project",
          work: (raw: unknown) => {
            const unit = raw as ScanUnit;
            if (unit.kind === "item") {
              const item = unit.item;
              if (item.typeName === "Footage") {
                const file = item.file;
                if (file === null || typeof file !== "object") {
                  missing.push({
                    itemId: item.id,
                    name: item.name,
                    path: "",
                    folder: unit.folder,
                    reason: "No file reference (placeholder or unsaved import)"
                  });
                } else if (file.exists !== true) {
                  missing.push({
                    itemId: item.id,
                    name: item.name,
                    path: file.fsName,
                    folder: unit.folder,
                    reason: "File missing on disk"
                  });
                }
              }
              if (
                (item.typeName === "Footage" || item.typeName === "Solid") &&
                used[String(item.id)] !== true
              ) {
                unused.push({
                  itemId: item.id,
                  name: item.name,
                  kind: item.typeName === "Solid" ? "Solid" : "Footage",
                  folder: unit.folder
                });
              }
              return;
            }
            const comp = unit.comp;
            const layer = comp.layer(unit.layerIndex);
            scanned.layers++;
            scanLayerExpressions(comp, layer, sink);
          },
          collect: (outcome) => {
            scanned.expressions = sink.expressions;
            const data: DoctorScanData = {
              projectPath: decodeProjectPath(project.fileURI),
              appVersion: ctx.env.app.version,
              scanned: scanned,
              counts: {
                missing: missing.length,
                unused: unused.length,
                brokenExpressions: sink.broken.length
              },
              missing: missing,
              unused: unused,
              brokenExpressions: sink.broken,
              cancelled: outcome.cancelled === true,
              hardErrors: outcome.errors.length
            };
            return data;
          }
        };
      }
    }
  };
}
