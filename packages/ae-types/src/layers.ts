/**
 * Composition + layer model (docs/02 §2.3, docs/03 §2–3).
 * Layer collections are 1-indexed and have NO `.length`; always iterate
 * `numLayers`. `selectedLayers` returns a real JS Array.
 */

import type { AeItem } from "./items.js";
import type { AeMarkerCollection } from "./items.js";
import type { AeEffect, AeProperty } from "./properties.js";

export type AeLayerType =
  | "av"
  | "text"
  | "shape"
  | "camera"
  | "light"
  | "adjustment"
  | "null"
  | string;

export interface AeLayer {
  /** 1-based position in the layer stack. */
  index: number;
  name: string;
  selected: boolean;
  locked: boolean;
  label: number;
  /** Internal class, e.g. "ADBE Text Layer". */
  matchName: string;
  layerType: AeLayerType;
  enabled: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  threeDLayer: boolean;
  shy: boolean;
  solo: boolean;
  motionBlur: boolean;
  adjustmentLayer: boolean;
  guideLayer: boolean;
  /** Seconds. */
  inPoint: number;
  outPoint: number;
  startTime: number;
  /** 100 = normal speed. */
  stretch: number;
  /** Layer whose transform this layer follows, or null. */
  parent: AeLayer | null;
  comment: string;
  source: AeItem | null;
  numProperties: number;
  property(nameOrIndex: string | number): AeProperty;
  numEffects: number;
  effect(nameOrIndex: string | number): AeEffect;
  /** Moves this layer to the top of the stack (index 1). */
  moveToBeginning(): void;
  remove(): void;
}

export interface AeLayerCollection {
  /** Count only — there is no `.length` on an AE layer collection. */
  numLayers: number;
  layer(index: number): AeLayer;
}

export interface AeCompItem extends AeItem {
  typeName: "Composition";
  width: number;
  height: number;
  frameRate: number;
  /** Seconds. */
  duration: number;
  /** Seconds. */
  displayStartTime: number;
  numLayers: number;
  layer(index: number): AeLayer;
  selectedLayers: AeLayer[];
  markerProperty: AeMarkerCollection;
  /** [r, g, b] in 0..1. */
  bgColor: number[];
  pixelAspect: number;
  shutterAngle: number;
  motionBlur: boolean;
  /** 1 = 8bpc, 2 = 16bpc, 3 = 32bpc (docs/03 §1 bit-depth audit). */
  bitsPerChannel: number;
  openInViewer(): unknown;
}
