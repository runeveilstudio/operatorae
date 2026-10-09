import {
  RQ_ITEM_STATUS,
  type AeCompItem,
  type AeOutputModule,
  type AeRenderQueue,
  type AeRenderQueueItem
} from "@operator/ae-types";
import { MockFile } from "./file.js";

/**
 * Render-queue model (docs/03 §10). Mirrors the parts RenderOps depends on:
 *  - items are 1-indexed; `numItems` is the count;
 *  - output modules are per-item and applyable by template name;
 *  - applying an unknown template throws (AE does too) — that error path is
 *    what the panel surfaces as an actionable message.
 */

/** Output-module templates AE ships (plus user-defined ones we seed). */
export const OUTPUT_MODULE_TEMPLATES = [
  "Lossless",
  "H.264 - Match Render Settings",
  "H.264",
  "PNG Sequence",
  "TIFF Sequence",
  "ProRes 422 HQ",
  "QuickTime - Apple ProRes 422 HQ"
] as const;

/** Render-settings templates. */
export const RENDER_SETTING_TEMPLATES = [
  "Best Settings",
  "Draft Settings",
  "Multi-Machine Settings"
] as const;

export class MockOutputModule implements AeOutputModule {
  name: string;
  template: string;
  file: MockFile | null;
  templates: string[];

  constructor(name: string, template = "Lossless", outputPath?: string) {
    this.name = name;
    this.template = template;
    this.file = outputPath === undefined ? null : new MockFile(outputPath);
    this.templates = [...OUTPUT_MODULE_TEMPLATES];
  }

  applyTemplate(templateName: string): void {
    if (!this.templates.includes(templateName)) {
      throw new Error(`Unknown output module template: "${templateName}"`);
    }
    this.template = templateName;
  }
}

export class MockRenderQueueItem implements AeRenderQueueItem {
  comp: AeCompItem;
  status: number;
  render: boolean;
  startTime: number;
  _outputModules: MockOutputModule[];
  _template: string;

  constructor(
    comp: AeCompItem,
    opts: {
      status?: number;
      render?: boolean;
      outputTemplate?: string;
      outputPath?: string;
      template?: string;
    } = {}
  ) {
    this.comp = comp;
    this.status = opts.status ?? RQ_ITEM_STATUS.QUEUED;
    this.render = opts.render !== false;
    this.startTime = 0;
    this._template = opts.template ?? "Best Settings";
    this._outputModules = [
      new MockOutputModule(`${comp.name}.mov`, opts.outputTemplate, opts.outputPath)
    ];
  }

  get numOutputModules(): number {
    return this._outputModules.length;
  }

  outputModule(index: number): AeOutputModule {
    if (index < 1 || index > this._outputModules.length) {
      throw new Error(`output module index out of range: ${index}`);
    }
    return this._outputModules[index - 1];
  }

  get outputModules(): AeOutputModule[] {
    return this._outputModules;
  }

  applyTemplate(templateName: string): void {
    if (!RENDER_SETTING_TEMPLATES.includes(templateName as never)) {
      throw new Error(`Unknown render settings template: "${templateName}"`);
    }
    this._template = templateName;
  }
}

export class MockRenderQueue implements AeRenderQueue {
  _items: MockRenderQueueItem[] = [];

  get numItems(): number {
    return this._items.length;
  }

  item(index: number): AeRenderQueueItem {
    if (index < 1 || index > this._items.length) {
      throw new Error(`render queue item index out of range: ${index}`);
    }
    return this._items[index - 1];
  }

  get items(): AeRenderQueueItem[] {
    return this._items;
  }

  add(comp: AeCompItem, outputTemplate?: string): MockRenderQueueItem {
    const item = new MockRenderQueueItem(comp, { outputTemplate });
    this._items.push(item);
    return item;
  }

  remove(index: number): void {
    if (index < 1 || index > this._items.length) {
      throw new Error(`render queue item index out of range: ${index}`);
    }
    this._items.splice(index - 1, 1);
  }
}
