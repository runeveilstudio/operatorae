import type {
  AeApplication,
  AeCompItem,
  AeFolderItem,
  AeFootageItem,
  AeItem,
  AeItemCollection,
  AeProject
} from "@operator/ae-types";
import { MockComp } from "./comp.js";
import { MockFile } from "./file.js";
import { MockFolder, MockFootage, MockItem, walkItems } from "./item.js";
import { MockRenderQueue } from "./render.js";
import type { MockFootageSpec, MockProjectSpec } from "./spec.js";

/**
 * Browser-safe mock of the AE scripting DOM (no Node APIs — safe for the
 * panel's dev fallback too). Mirrors the documented quirks in @operator/ae-types:
 * 1-indexed collections, no `.length` on a layer collection, `selectedLayers`
 * and `selection` as real Arrays, `fileURI` as a percent-encoded string.
 */

class MockItemCollection implements AeItemCollection {
  constructor(
    private readonly project: MockProjectImpl,
    private readonly nextId: () => number
  ) {}

  addComp(
    name: string,
    width: number,
    height: number,
    pixelAspect: number,
    duration: number,
    frameRate: number
  ): AeCompItem {
    const comp = new MockComp(this.nextId(), {
      name,
      width,
      height,
      pixelAspect,
      duration,
      frameRate
    });
    this.project._adopt(comp);
    return comp;
  }

  addFolder(name: string): AeFolderItem {
    const folder = new MockFolder(this.nextId(), name);
    this.project._adopt(folder);
    return folder;
  }

  addNull(name: string): AeFootageItem {
    const nullItem = new MockFootage(this.nextId(), name, { file: null });
    this.project._adopt(nullItem);
    return nullItem;
  }
}

export class MockProjectImpl implements AeProject {
  /** Every item in creation order — what `project.item(i)` enumerates. */
  _all: AeItem[] = [];
  /** Root-level items; folders hold their own children. */
  _root: AeItem[] = [];
  renderQueue = new MockRenderQueue();
  items: AeItemCollection;
  file: MockFile | null;
  private _saved = false;

  constructor(fileURI: string, nextId: () => number) {
    this.file = fileURI === "" ? null : new MockFile(uriToPath(fileURI));
    this.items = new MockItemCollection(this, nextId);
  }

  /** Register a freshly created item at the project root. */
  _adopt(item: AeItem): void {
    this._all.push(item);
    this._root.push(item);
    item.parentFolder = null;
    (item as MockItem)._owner = this;
  }

  /** Register an item inside a folder. */
  _adoptInto(folder: MockFolder, item: AeItem): void {
    this._all.push(item);
    folder._items.push(item);
    item.parentFolder = folder;
    (item as MockItem)._owner = this;
  }

  get fileURI(): string {
    return this.file ? this.file.absoluteURI : "";
  }

  get numItems(): number {
    return this._all.length;
  }

  item(index: number): AeItem {
    if (index < 1 || index > this._all.length) {
      throw new Error(`item index out of range: ${index}`);
    }
    return this._all[index - 1];
  }

  itemByID(id: number): AeItem {
    for (const item of this._all) {
      if (item.id === id) return item;
    }
    throw new Error(`no project item with id ${id}`);
  }

  get activeItem(): AeItem | null {
    const selected = this._all.filter((i) => i.selected);
    return selected.length > 0 ? selected[selected.length - 1] : null;
  }

  get selection(): AeItem[] {
    return this._all.filter((i) => i.selected);
  }

  save(): void {
    this._saved = true;
  }

  get saved(): boolean {
    return this._saved || this.file !== null;
  }
}

export interface MockAeEnv {
  app: AeApplication;
  /** Every beginUndoGroup/endUndoGroup call, in order. */
  undoLog: string[];
  /** Every scheduleTask code string, in order (the chunk mechanism). */
  scheduledTasks: string[];
  /** Every executeCommand id, in order. */
  executedCommands: number[];
  project: MockProjectImpl;
  comps: MockComp[];
  /** All items, in creation order (comps + footage + folders). */
  items: AeItem[];
  folders: MockFolder[];
  /** Find a comp by name, or null. */
  findComp(name: string): MockComp | null;
}

function uriToPath(fileURI: string): string {
  let s = fileURI;
  if (s.indexOf("file://") === 0) s = s.substring("file://".length);
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function createMockAeEnv(spec: MockProjectSpec = {}): MockAeEnv {
  const undoLog: string[] = [];
  const scheduledTasks: string[] = [];
  const executedCommands: number[] = [];
  const comps: MockComp[] = [];
  const folders: MockFolder[] = [];
  let nextId = 1;
  const allocId = (): number => nextId++;

  const project = new MockProjectImpl(spec.fileURI ?? "", allocId);

  function folderNamed(name: string): MockFolder {
    for (const f of folders) {
      if (f.name === name) return f;
    }
    const folder = new MockFolder(allocId(), name);
    project._adopt(folder);
    folders.push(folder);
    return folder;
  }

  for (const name of spec.folders ?? []) folderNamed(name);

  for (const compSpec of spec.comps ?? []) {
    const comp = new MockComp(allocId(), compSpec);
    if (compSpec.parentFolder) project._adoptInto(folderNamed(compSpec.parentFolder), comp);
    else project._adopt(comp);
    if (compSpec.active === true) comp.selected = true;
    comps.push(comp);
  }

  for (const footSpec of spec.footage ?? []) {
    const footage = buildFootage(footSpec, allocId());
    if (footSpec.parentFolder) project._adoptInto(folderNamed(footSpec.parentFolder), footage);
    else project._adopt(footage);
  }

  for (const rq of spec.renderQueue ?? []) {
    const comp = comps.find((c) => c.name === rq.compName);
    if (!comp) continue;
    const item = project.renderQueue.add(comp, rq.outputTemplate);
    if (rq.template) item.applyTemplate(rq.template);
    if (rq.status !== undefined) item.status = rq.status;
    if (rq.render !== undefined) item.render = rq.render;
    if (rq.outputPath) item.outputModule(1).file = new MockFile(rq.outputPath);
  }

  const app: AeApplication = {
    version: spec.appVersion ?? "26.0.2",
    buildName: spec.buildName ?? "26.0.2x42",
    project,
    isRenderEngine: spec.isRenderEngine === true,
    beginUndoGroup(name: string) {
      undoLog.push(`begin:${name}`);
    },
    endUndoGroup() {
      undoLog.push("end");
    },
    scheduleTask(code: string) {
      scheduledTasks.push(code);
    },
    executeCommand(commandId: number) {
      executedCommands.push(commandId);
    },
    findMenuCommandId(menuCommand: string) {
      // Stable, deterministic ids for tests; real AE returns menu ids.
      return menuCommand === "" ? 0 : 1000 + menuCommand.length;
    }
  };

  const allItems: AeItem[] = [...project._all];

  return {
    app,
    undoLog,
    scheduledTasks,
    executedCommands,
    project,
    comps,
    items: allItems,
    folders,
    findComp(name: string): MockComp | null {
      return comps.find((c) => c.name === name) ?? null;
    }
  };
}

function buildFootage(spec: MockFootageSpec, id: number): MockFootage {
  const file =
    spec.solid === true ? null : new MockFile(spec.path ?? `/mock/${spec.name}`, spec.missing !== true);
  const footage = new MockFootage(id, spec.name, {
    file,
    solid: spec.solid,
    width: spec.width,
    height: spec.height,
    duration: spec.duration,
    frameRate: spec.frameRate,
    hasVideo: spec.hasVideo,
    hasAudio: spec.hasAudio,
    solidColor: spec.solidColor
  });
  if (spec.label !== undefined) footage.label = spec.label;
  if (spec.comment !== undefined) footage.comment = spec.comment;
  return footage;
}

/** Depth-first walk of the whole project (folders included). */
export function eachItem(project: MockProjectImpl, visit: (item: AeItem) => void): void {
  for (const item of project._all) visit(item);
  for (const folder of project._all) {
    if (folder.typeName === "Folder") walkItems(folder as MockFolder, visit);
  }
}
