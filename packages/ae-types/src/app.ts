/**
 * Application + project + render-queue model (docs/02 §2.3, docs/03 §1/§10).
 * Both `project.item(i)` (1-indexed flat access) and `project.items` (the
 * builder collection) exist in AE; we keep both. `fileURI` is the
 * percent-encoded string form of `file.absoluteURI`.
 */

import type { AeFile, AeFolderItem, AeItem, AeFootageItem } from "./items.js";
import type { AeCompItem } from "./layers.js";

export interface AeItemCollection {
  addComp(
    name: string,
    width: number,
    height: number,
    pixelAspect: number,
    duration: number,
    frameRate: number
  ): AeCompItem;
  addFolder(name: string): AeFolderItem;
  addNull(name: string): AeFootageItem;
}

/** Mirrors AE's RQItemStatus; compare against these, never raw integers. */
export const RQ_ITEM_STATUS = {
  UNQUEUED: 1,
  QUEUED: 2,
  RENDERING: 3,
  DONE: 4,
  ERR_STOPPED: 5,
  USER_STOPPED: 6,
  WILL_CONTINUE: 7,
  NEEDS_OUTPUT: 8
} as const;

export function rqStatusName(value: number): string {
  for (const [name, code] of Object.entries(RQ_ITEM_STATUS)) {
    if (code === value) return name;
  }
  return `UNKNOWN(${value})`;
}

export interface AeOutputModule {
  name: string;
  /** "Lossless" | "H.264" | user template name. */
  template: string;
  file: AeFile | null;
  /** Names of applyable output-module templates (docs/03 §10). */
  templates: string[];
  applyTemplate(templateName: string): void;
}

export interface AeRenderQueueItem {
  comp: AeCompItem;
  status: number;
  render: boolean;
  startTime: number;
  numOutputModules: number;
  outputModule(index: number): AeOutputModule;
  outputModules: AeOutputModule[];
  applyTemplate(templateName: string): void;
}

export interface AeRenderQueue {
  numItems: number;
  item(index: number): AeRenderQueueItem;
  items: AeRenderQueueItem[];
}

export interface AeProject {
  /** 1-indexed item access; count via numItems. */
  numItems: number;
  item(index: number): AeItem;
  itemByID(id: number): AeItem;
  items: AeItemCollection;
  /** null when the project has never been saved. */
  file: AeFile | null;
  /** Percent-encoded project URI, or "" when unsaved. */
  fileURI: string;
  activeItem: AeItem | null;
  /** Selected project-panel items (a real Array). */
  selection: AeItem[];
  renderQueue: AeRenderQueue;
  save(): void;
}

/** An item is "missing" when it is footage with no resolvable file. */
export function isMissingFootage(item: AeItem): boolean {
  const footage = item as AeFootageItem;
  if (item.typeName !== "Footage") return false;
  return footage.file === null || footage.file.exists === false;
}

export interface AeApplication {
  version: string;
  /** e.g. "26.0.2x42" — AE build string, used in the diagnostics bundle. */
  buildName: string;
  project: AeProject;
  /** True when launched headless via aerender (docs/03 §10). */
  isRenderEngine: boolean;
  beginUndoGroup(name: string): void;
  endUndoGroup(): void;
  /**
   * AE-only cooperative yield: evaluates `code` in the ExtendScript global
   * scope after ~delayMs. This is the chunk-scheduling primitive
   * (docs/02 §2.3 task protocol step 3).
   */
  scheduleTask(code: string, delayMs: number, repeat: boolean): void;
  /** Runs a built-in AE menu command id (docs/03 §13 console helpers). */
  executeCommand(commandId: number): void;
  findMenuCommandId(menuCommand: string): number;
}

/** The host instance installed into the panel engine. */
export interface AeHostGlobals {
  app: AeApplication;
  /** $ global: engine name, os, etc. */
  os?: string;
}
