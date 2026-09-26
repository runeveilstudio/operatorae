import type { AeApplication, AeCompItem, AeItem, AeLayer, AeProject } from "@operator/ae-types";

/**
 * Browser-safe mock of the AE scripting DOM (no Node APIs — safe for the
 * panel's dev fallback too). Mirrors the documented quirks in @operator/ae-types:
 * 1-indexed collections, no `.length` on LayerCollection, `selectedLayers`
 * as a real Array, `fileURI` as a percent-encoded string.
 */

export interface MockLayerSpec {
  name: string;
  selected?: boolean;
  locked?: boolean;
  label?: number;
}

export interface MockCompSpec {
  name: string;
  width?: number;
  height?: number;
  frameRate?: number;
  duration?: number;
  layers?: MockLayerSpec[];
  active?: boolean;
}

export interface MockProjectSpec {
  name?: string;
  fileURI?: string;
  appVersion?: string;
  comps?: MockCompSpec[];
  footage?: { name: string; missing?: boolean }[];
}

class MockLayerImpl implements AeLayer {
  name: string;
  index: number;
  selected: boolean;
  locked: boolean;
  label: number;
  constructor(name: string, index: number, spec: MockLayerSpec) {
    this.name = name;
    this.index = index;
    this.selected = spec.selected ?? false;
    this.locked = spec.locked ?? false;
    this.label = spec.label ?? 0;
  }
}

class MockCompImpl implements AeCompItem {
  typeName: "Composition" = "Composition";
  id: number;
  name: string;
  selected = false;
  label = 0;
  width: number;
  height: number;
  frameRate: number;
  duration: number;
  _layers: MockLayerImpl[];
  constructor(name: string, id: number, spec: MockCompSpec) {
    this.name = name;
    this.id = id;
    this.width = spec.width ?? 1920;
    this.height = spec.height ?? 1080;
    this.frameRate = spec.frameRate ?? 30;
    this.duration = spec.duration ?? 10;
    this._layers = (spec.layers ?? []).map((l, i) => new MockLayerImpl(l.name, i + 1, l));
  }
  get numLayers(): number {
    return this._layers.length;
  }
  layer(index: number): AeLayer {
    if (index < 1 || index > this._layers.length) {
      throw new Error(`layer index out of range: ${index}`);
    }
    return this._layers[index - 1];
  }
  get selectedLayers(): AeLayer[] {
    return this._layers.filter((l) => l.selected);
  }
}

class MockFootageImpl implements AeItem {
  typeName = "Footage";
  selected = false;
  label = 0;
  name: string;
  id: number;
  missing: boolean;
  constructor(name: string, id: number, missing: boolean) {
    this.name = name;
    this.id = id;
    this.missing = missing;
  }
}

class MockProjectImpl implements AeProject {
  _items: { item: AeItem; missing?: boolean }[] = [];
  constructor(public fileURI: string) {}
  get numItems(): number {
    return this._items.length;
  }
  item(index: number): AeItem {
    if (index < 1 || index > this._items.length) {
      throw new Error(`item index out of range: ${index}`);
    }
    return this._items[index - 1].item;
  }
  get activeItem(): AeItem | null {
    const active = this._items.filter((i) => i.item.selected);
    return active.length > 0 ? active[active.length - 1].item : null;
  }
}

export interface MockAeEnv {
  app: AeApplication;
  /** Every beginUndoGroup/endUndoGroup call, in order. */
  undoLog: string[];
  /** Every scheduleTask code string, in order (the production chunk mechanism). */
  scheduledTasks: string[];
  project: MockProjectImpl;
  comps: MockCompImpl[];
}

export function createMockAeEnv(spec: MockProjectSpec = {}): MockAeEnv {
  const project = new MockProjectImpl(spec.fileURI ?? "");
  const undoLog: string[] = [];
  const scheduledTasks: string[] = [];
  const comps: MockCompImpl[] = [];

  let nextId = 1;
  for (const c of spec.comps ?? []) {
    const comp = new MockCompImpl(c.name, nextId++, c);
    if (c.active) comp.selected = true;
    project._items.push({ item: comp });
    comps.push(comp);
  }
  for (const f of spec.footage ?? []) {
    project._items.push({ item: new MockFootageImpl(f.name, nextId++, f.missing ?? false) });
  }

  const app: AeApplication = {
    version: spec.appVersion ?? "26.0.2",
    project: project,
    beginUndoGroup(name: string) {
      undoLog.push(`begin:${name}`);
    },
    endUndoGroup() {
      undoLog.push("end");
    },
    scheduleTask(code: string) {
      scheduledTasks.push(code);
    }
  };

  return { app, undoLog, scheduledTasks, project, comps };
}
