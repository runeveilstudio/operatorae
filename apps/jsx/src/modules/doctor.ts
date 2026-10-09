import type {
  AeCompItem,
  AeEffect,
  AeFolderItem,
  AeFootageItem,
  AeItem,
  AeLayer,
  AeProject
} from "@operator/ae-types";
import { CAPABILITIES, TASK_ERROR_CODES, err } from "../core/protocol.js";
import { isComp, decodeProjectPath, type Handler, type HandlerCtx } from "../core/operator.js";

/**
 * Asset Doctor (docs/03 §1, docs/05 Phase 1): one read-only sweep that audits
 * the whole project for missing media, unused footage, duplicate sources and
 * broken expressions, plus the first two fix-commands — relink footage and
 * remove unused — so findings feed repairs with dry-run previews and a single
 * undo step for each batch (docs/02 §2.3).
 *
 * The scan is chunked with progress + cooperative cancel but declares
 * mutating:false so no undo group is ever opened. Fix-commands are mutating
 * batches: one undo group held open across chunks.
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

export interface DuplicateItemRef {
  itemId: number;
  name: string;
  folder: string;
}

export interface DuplicateFinding {
  path: string;
  count: number;
  items: DuplicateItemRef[];
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
  counts: { missing: number; unused: number; duplicates: number; brokenExpressions: number };
  missing: MissingFinding[];
  unused: UnusedFinding[];
  duplicates: DuplicateFinding[];
  brokenExpressions: BrokenExpressionFinding[];
  cancelled: boolean;
  hardErrors: number;
}

type ScanUnit =
  | { kind: "item"; item: AeItem; folder: string }
  | { kind: "layer"; comp: AeCompItem; layerIndex: number };

interface ProjectWalk {
  items: Array<{ item: AeItem; folder: string }>;
  comps: AeCompItem[];
}

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

function safeNum(fn: () => number | undefined | null): number {
  try {
    const v = fn();
    return typeof v === "number" && isFinite(v) ? v : 0;
  } catch (_e) {
    return 0;
  }
}

/** Case/slash-insensitive path key. Mirrors the doc 04 §3 relink matching
 * rule; deeper fuzzy relink stays sidecar territory (Phase 3, pathkit). */
function normalizeFsPath(fsName: string): string {
  return fsName.split("\\").join("/").toLowerCase();
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

/**
 * Id-deduped walk over the whole project tree. Real AE enumerates only root
 * items via project.item(i); the mock also leaks nested items there — the
 * visited set keeps both hosts at exactly one visit per item.
 */
function walkProject(project: AeProject): ProjectWalk {
  const walk: ProjectWalk = { items: [], comps: [] };
  const seen: Record<string, boolean> = {};
  function visit(item: AeItem): void {
    const key = String(item.id);
    if (seen[key] === true) return;
    seen[key] = true;
    walk.items.push({ item: item, folder: folderPathOf(item) });
    if (isComp(item)) {
      walk.comps.push(item as AeCompItem);
    }
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
  return walk;
}

/** Every item id referenced as a layer source in any comp. */
function usedIdsFrom(comps: AeCompItem[]): Record<string, boolean> {
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
  return used;
}

function isUnusedItem(item: AeItem, used: Record<string, boolean>): boolean {
  if (item.typeName !== "Footage" && item.typeName !== "Solid") return false;
  return used[String(item.id)] !== true;
}

function isMissingItem(item: AeItem): boolean {
  if (item.typeName !== "Footage") return false;
  return item.file === null || item.file.exists !== true;
}

/** Group footage items by normalized source path; 2+ per path = duplicate. */
function findDuplicates(walk: ProjectWalk): DuplicateFinding[] {
  const groups: Record<string, { path: string; refs: DuplicateItemRef[] }> = {};
  const order: string[] = [];
  for (let i = 0; i < walk.items.length; i++) {
    const entry = walk.items[i];
    const item = entry.item;
    if (item.typeName !== "Footage") continue;
    const file = item.file;
    if (file === null || typeof file !== "object") continue;
    const key = normalizeFsPath(file.fsName);
    if (groups[key] === undefined) {
      groups[key] = { path: file.fsName, refs: [] };
      order.push(key);
    }
    groups[key].refs.push({ itemId: item.id, name: item.name, folder: entry.folder });
  }
  const findings: DuplicateFinding[] = [];
  for (let i = 0; i < order.length; i++) {
    const group = groups[order[i]];
    if (group.refs.length > 1) {
      findings.push({ path: group.path, count: group.refs.length, items: group.refs });
    }
  }
  return findings;
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
    let group: WalkNode | null = null;
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

/** Convert engine skip-errors into a readable skipped list (renameBatch pattern). */
function skippedFrom(errors: Array<{ code: string; message: string; target?: string }>): Array<{
  target: string | null;
  reason: string;
}> {
  const skipped: Array<{ target: string | null; reason: string }> = [];
  for (let i = 0; i < errors.length; i++) {
    if (errors[i].code === TASK_ERROR_CODES.ITEM_SKIPPED) {
      const target = errors[i].target;
      skipped.push({
        target: typeof target === "string" ? target : null,
        reason: errors[i].message
      });
    }
  }
  return skipped;
}

function readRelinkEntries(args: Record<string, unknown>): Array<{ itemId: number; path: string }> {
  const raw = args.entries;
  if (raw === null || typeof raw !== "object" || raw instanceof Array !== true) {
    throw err(TASK_ERROR_CODES.ARG_INVALID, 'Argument "entries" must be an array of { itemId, path }');
  }
  const list = raw as Array<Record<string, unknown>>;
  if (list.length === 0) {
    throw err(TASK_ERROR_CODES.ARG_INVALID, '"entries" is empty — nothing to relink');
  }
  const out: Array<{ itemId: number; path: string }> = [];
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (entry === null || typeof entry !== "object") {
      throw err(TASK_ERROR_CODES.ARG_INVALID, "entries[" + i + "] must be an object with itemId and path");
    }
    if (typeof entry.itemId !== "number" || !isFinite(entry.itemId)) {
      throw err(TASK_ERROR_CODES.ARG_INVALID, "entries[" + i + "].itemId must be a number");
    }
    if (typeof entry.path !== "string" || entry.path === "") {
      throw err(TASK_ERROR_CODES.ARG_INVALID, "entries[" + i + "].path must be a non-empty string");
    }
    out.push({ itemId: entry.itemId, path: entry.path });
  }
  return out;
}

export function doctorHandlers(): Record<string, Handler> {
  return {
    doctorScan: {
      kind: "batch",
      capability: CAPABILITIES.PROJECT,
      mutating: false,
      plan: (ctx: HandlerCtx) => {
        const project = ctx.env.app.project;
        const walk = walkProject(project);
        const used = usedIdsFrom(walk.comps);
        const duplicates = findDuplicates(walk);
        const missing: MissingFinding[] = [];
        const unused: UnusedFinding[] = [];
        const sink: ExpressionSink = { broken: [], expressions: 0 };
        const scanned = { items: 0, comps: 0, layers: 0, expressions: 0 };
        scanned.items = walk.items.length;
        scanned.comps = walk.comps.length;

        const units: ScanUnit[] = [];
        for (let i = 0; i < walk.comps.length; i++) {
          const comp = walk.comps[i];
          for (let l = 1; l <= comp.numLayers; l++) {
            units.push({ kind: "layer", comp: comp, layerIndex: l });
          }
        }
        for (let i = 0; i < walk.items.length; i++) {
          const entry = walk.items[i];
          units.push({ kind: "item", item: entry.item, folder: entry.folder });
        }

        return {
          items: units,
          label: "Auditing project",
          work: (raw: unknown) => {
            const unit = raw as ScanUnit;
            if (unit.kind === "layer") {
              scanned.layers++;
              scanLayerExpressions(unit.comp, unit.comp.layer(unit.layerIndex), sink);
              return;
            }
            const item = unit.item;
            if (isMissingItem(item)) {
              missing.push({
                itemId: item.id,
                name: item.name,
                path: item.file !== null ? item.file.fsName : "",
                folder: unit.folder,
                reason: item.file === null ? "No file reference (placeholder or unsaved import)" : "File missing on disk"
              });
            }
            if (isUnusedItem(item, used)) {
              unused.push({
                itemId: item.id,
                name: item.name,
                kind: item.typeName === "Solid" ? "Solid" : "Footage",
                folder: unit.folder
              });
            }
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
                duplicates: duplicates.length,
                brokenExpressions: sink.broken.length
              },
              missing: missing,
              unused: unused,
              duplicates: duplicates,
              brokenExpressions: sink.broken,
              cancelled: outcome.cancelled === true,
              hardErrors: outcome.errors.length
            };
            return data;
          }
        };
      }
    },

    /** Fix-command: re-point footage items at new file paths (docs/03 §1). */
    relinkMissing: {
      kind: "batch",
      capability: CAPABILITIES.PROJECT,
      mutating: true,
      plan: (ctx: HandlerCtx) => {
        const project = ctx.env.app.project;
        const entries = readRelinkEntries(ctx.args);
        type RelinkUnit = { item: AeItem; path: string };
        const units: RelinkUnit[] = [];
        for (let i = 0; i < entries.length; i++) {
          let item: AeItem = null as unknown as AeItem;
          try {
            item = project.itemByID(entries[i].itemId);
          } catch (_e) {
            throw err(
              TASK_ERROR_CODES.ARG_INVALID,
              "No project item with id " + entries[i].itemId + " (entries[" + i + "])"
            );
          }
          units.push({ item: item, path: entries[i].path });
        }
        const preview: Array<{ itemId: number; name: string; from: string; to: string }> = [];
        let relinked = 0;
        return {
          items: units,
          label: "Relinking footage",
          work: (raw: unknown) => {
            const unit = raw as RelinkUnit;
            const item = unit.item;
            if (item.typeName !== "Footage") {
              return { reason: "Item is not footage", target: item.name };
            }
            const file = ctx.env.makeFile(unit.path);
            if (file === null || typeof file !== "object" || file.exists !== true) {
              return { reason: "Target file does not exist: " + unit.path, target: item.name };
            }
            if (ctx.dryRun) {
              preview.push({
                itemId: item.id,
                name: item.name,
                from: item.file !== null ? item.file.fsName : "",
                to: unit.path
              });
              return;
            }
            (item as AeFootageItem).replace(file);
            relinked++;
          },
          collect: (outcome) => {
            return {
              dryRun: ctx.dryRun,
              total: outcome.total,
              processed: outcome.done,
              relinked: ctx.dryRun ? 0 : relinked,
              preview: ctx.dryRun ? preview : null,
              skippedCount: skippedFrom(outcome.errors).length,
              skipped: skippedFrom(outcome.errors)
            };
          }
        };
      }
    },

    /** Fix-command: delete every footage/solid item no layer references. */
    removeUnused: {
      kind: "batch",
      capability: CAPABILITIES.PROJECT,
      mutating: true,
      plan: (ctx: HandlerCtx) => {
        const walk = walkProject(ctx.env.app.project);
        const used = usedIdsFrom(walk.comps);
        type RemoveUnit = { item: AeItem; kind: "Footage" | "Solid"; folder: string };
        const units: RemoveUnit[] = [];
        for (let i = 0; i < walk.items.length; i++) {
          const entry = walk.items[i];
          if (isUnusedItem(entry.item, used)) {
            units.push({
              item: entry.item,
              kind: entry.item.typeName === "Solid" ? "Solid" : "Footage",
              folder: entry.folder
            });
          }
        }
        const preview: Array<{ itemId: number; name: string; kind: string; folder: string }> = [];
        let removed = 0;
        return {
          items: units,
          label: "Removing unused footage",
          work: (raw: unknown) => {
            const unit = raw as RemoveUnit;
            if (ctx.dryRun) {
              preview.push({
                itemId: unit.item.id,
                name: unit.item.name,
                kind: unit.kind,
                folder: unit.folder
              });
              return;
            }
            try {
              unit.item.remove();
            } catch (e) {
              return { reason: "Could not remove (item is in use?): " + String(e), target: unit.item.name };
            }
            removed++;
          },
          collect: (outcome) => {
            return {
              dryRun: ctx.dryRun,
              total: outcome.total,
              processed: outcome.done,
              removed: ctx.dryRun ? 0 : removed,
              preview: ctx.dryRun ? preview : null,
              skippedCount: skippedFrom(outcome.errors).length,
              skipped: skippedFrom(outcome.errors),
              remainingAfterCancel: outcome.cancelled ? outcome.total - outcome.done : 0
            };
          }
        };
      }
    }
  };
}
