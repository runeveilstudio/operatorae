/**
 * Minimal, hand-curated typings for the After Effects scripting DOM surface
 * OPERATOR touches (docs/02 §2.3 module map). Grows command by command;
 * every quirk is captured here so apps/jsx and packages/ae-mock share one
 * source of truth (docs/05 R10: quirk knowledge lives in the repo, not in heads).
 *
 * Imported TYPE-ONLY by apps/jsx (erased at compile → no runtime dependency
 * in the ES3 bundle) and imported structurally by packages/ae-mock.
 *
 * Documented AE quirks honored here:
 *  - Collections are 1-indexed: item(i)/layer(i), counts are numItems/numLayers.
 *  - LayerCollection has no `.length`; always iterate numLayers.
 *  - comp.selectedLayers returns a real JS Array.
 *  - app.project.fileURI is a percent-encoded URI string, not a File object.
 */

export type AeItemType = "Composition" | "Footage" | "Folder" | "Solid" | string;

export interface AeItem {
  id: number;
  name: string;
  typeName: AeItemType;
  selected: boolean;
  /** Label color id (0 = none). */
  label: number;
}

export interface AeCompItem extends AeItem {
  typeName: "Composition";
  width: number;
  height: number;
  frameRate: number;
  /** Seconds. */
  duration: number;
  numLayers: number;
  layer(index: number): AeLayer;
  selectedLayers: AeLayer[];
}

export type AeLayerType = "av" | "text" | "shape" | "camera" | "light" | "adjustment" | string;

export interface AeLayer {
  index: number;
  name: string;
  selected: boolean;
  locked: boolean;
  label: number;
  /** matchName carries the internal class (e.g. "ADBE Text Layer"). */
  matchName?: string;
  layerType?: AeLayerType;
}

export interface AeProject {
  /** 1-indexed item access; count via numItems. */
  numItems: number;
  item(index: number): AeItem;
  /** Percent-encoded project URI, or "" when unsaved. */
  fileURI: string;
  activeItem: AeItem | null;
}

export interface AeApplication {
  version: string;
  project: AeProject;
  beginUndoGroup(name: string): void;
  endUndoGroup(): void;
  /**
   * AE-only cooperative yield: evaluates `code` in the ExtendScript global
   * scope after ~delayMs. This is the chunk-scheduling primitive
   * (docs/02 §2.3 task protocol step 3).
   */
  scheduleTask(code: string, delayMs: number, repeat: boolean): void;
}

/** The host instance installed into the panel engine. */
export interface AeHostGlobals {
  app: AeApplication;
  /** $ global: engine name, os, etc. */
  os?: string;
}
