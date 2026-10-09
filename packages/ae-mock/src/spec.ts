import type { AeLayerType, AeTextDocument } from "@operator/ae-types";

/**
 * Declarative specs for building a mock AE project (packages/ae-mock).
 * These are the fixture language used by every test and by the panel's
 * browser dev mode (apps/panel/src/bridge.ts). Specs are intentionally
 * shaped like the AE DOM so fixtures read like a description of a real comp.
 */

export type MockPropValue = number | number[] | string | boolean | AeTextDocument;

/** A node in a layer's property tree (Transform, Text Document, params…). */
export interface MockPropSpec {
  name: string;
  /** Locale-proof internal name (e.g. "ADBE Opacity"). */
  matchName: string;
  /** Defaults to "OneD" for numbers, "Group" when `children` is set. */
  propertyType?: string;
  value?: MockPropValue;
  /** Existing keyframes (sorted by time). */
  keys?: Array<{ time: number; value: number | number[] | string }>;
  expression?: string;
  /** AE's cached evaluation error; non-empty = broken (Asset Doctor). */
  expressionError?: string;
  /** False to model properties AE refuses to script (docs/03 §8). */
  canSetExpression?: boolean;
  children?: MockPropSpec[];
}

export interface MockEffectSpec extends MockPropSpec {
  enabled?: boolean;
}

export interface MockLayerSpec {
  name: string;
  selected?: boolean;
  locked?: boolean;
  label?: number;
  layerType?: AeLayerType;
  /** Defaults from layerType (e.g. "ADBE Text Layer"). */
  matchName?: string;
  enabled?: boolean;
  hasVideo?: boolean;
  hasAudio?: boolean;
  threeDLayer?: boolean;
  shy?: boolean;
  solo?: boolean;
  motionBlur?: boolean;
  adjustmentLayer?: boolean;
  guideLayer?: boolean;
  inPoint?: number;
  outPoint?: number;
  startTime?: number;
  stretch?: number;
  comment?: string;
  /** 1-based index of this layer's parent *in the same comp*, or null. */
  parentIndex?: number | null;
  /** Partial text document for text layers; merged over the defaults. */
  text?: Partial<AeTextDocument>;
  /** Extra/override properties, matched by matchName against the defaults. */
  props?: MockPropSpec[];
  effects?: MockEffectSpec[];
}

export interface MockMarkerSpec {
  time: number;
  duration?: number;
  comment?: string;
  chapter?: string;
  url?: string;
  frameTarget?: string;
}

export interface MockCompSpec {
  name: string;
  width?: number;
  height?: number;
  frameRate?: number;
  duration?: number;
  displayStartTime?: number;
  pixelAspect?: number;
  bgColor?: number[];
  motionBlur?: boolean;
  /** 1 = 8bpc, 2 = 16bpc, 3 = 32bpc. */
  bitsPerChannel?: number;
  label?: number;
  comment?: string;
  /** Open the comp in a viewer on build (sets it as project.activeItem). */
  active?: boolean;
  /** Name of a folder to nest this comp under (created if needed). */
  parentFolder?: string;
  layers?: MockLayerSpec[];
  markers?: MockMarkerSpec[];
}

export interface MockFootageSpec {
  name: string;
  /** Path on disk; defaults to "/mock/<name>". */
  path?: string;
  /** Missing footage: `file.exists === false` (docs/03 §1 Asset Doctor). */
  missing?: boolean;
  /** No `file` at all (a solid, for example). */
  solid?: boolean;
  width?: number;
  height?: number;
  duration?: number;
  frameRate?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
  label?: number;
  comment?: string;
  parentFolder?: string;
}

export interface MockRenderQueueItemSpec {
  compName: string;
  template?: string;
  status?: number;
  render?: boolean;
  outputTemplate?: string;
  outputPath?: string;
}

export interface MockProjectSpec {
  fileURI?: string;
  appVersion?: string;
  buildName?: string;
  isRenderEngine?: boolean;
  /** Folder names created at the project root (in order). */
  folders?: string[];
  comps?: MockCompSpec[];
  footage?: MockFootageSpec[];
  renderQueue?: MockRenderQueueItemSpec[];
}

export { MockFile } from "./file.js";
