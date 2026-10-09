/**
 * Property model (docs/02 §2.3). AE exposes every animatable thing as a
 * PropertyGroup tree addressed by name or 1-based index, and by `matchName`
 * for locale-proof lookups (the only safe way to find e.g. Opacity).
 *
 * Honored rules:
 *  - `numProperties` counts children; `property(i)` is 1-indexed.
 *  - `property("ADBE Opacity")` matches matchName first, then display name.
 *  - Leaves expose `value`, `numKeys`, `keyTime(i)`, `keyValue(i)` (1-indexed).
 *  - Text documents are the value of the "ADBE Text Document" property.
 */

export interface AeTextDocument {
  text: string;
  font: string;
  fontSize: number;
  /** [r, g, b] in 0..1. */
  fillColor: number[];
  strokeColor: number[];
  strokeWidth: number;
  applyFill: boolean;
  applyStroke: boolean;
  /** Tracking in 1/1000 em. */
  tracking: number;
  leading: number;
  justification: string;
  allCaps: boolean;
  smallCaps: boolean;
  /** True for paragraph (box) text. */
  boxText: boolean;
  boxTextSize?: number[];
}

/** Which member applies is decided by `propertyType`. */
export type AePropertyValue =
  | number
  | number[]
  | string
  | boolean
  | AeTextDocument
  | null;

export interface AePropertyBase {
  name: string;
  /** Internal class name, e.g. "ADBE Opacity" — the locale-proof key. */
  matchName: string;
  /** "OneD" | "TwoD" | "ThreeD" | "Color" | "TextDocument" | "Group" | ... */
  propertyType: string;
  numProperties: number;
  /** False when this group is currently inactive (hidden/unsupported). */
  active: boolean;
  property(nameOrIndex: string | number): AeProperty;
}

export interface AeProperty extends AePropertyBase {
  /** Leaf value. Reading a group throws in AE; the mock throws too. */
  value: AePropertyValue;
  numKeys: number;
  /** 1-indexed. */
  keyTime(index: number): number;
  /** 1-indexed. */
  keyValue(index: number): AePropertyValue;
  nearestKeyIndex(time: number): number;
  setValueAtTime(time: number, value: AePropertyValue): void;
  removeKey(index: number): void;
  /** "" when no expression. */
  expression: string;
  /** AE's cached evaluation error for the expression; "" when it evaluates. */
  expressionError: string;
  expressionEnabled: boolean;
  /** False on properties AE will not let scripts drive (docs/03 §8). */
  canSetExpression: boolean;
}

export interface AeEffect extends AePropertyBase {
  /** 1-based index within its layer's effect list. */
  effectIndex?: number;
  enabled: boolean;
  remove(): void;
}

/** Known matchNames we address by constant instead of string literals. */
export const MATCH = {
  TRANSFORM: "ADBE Transform Group",
  POSITION: "ADBE Position",
  SCALE: "ADBE Scale",
  ROTATION: "ADBE Rotate Z",
  OPACITY: "ADBE Opacity",
  ANCHOR: "ADBE Anchor Point",
  TEXT_PROPERTIES: "ADBE Text Properties",
  TEXT_DOCUMENT: "ADBE Text Document",
  TEXT_SOURCE: "Source Text",
  ROOT_VECTORS: "ADBE Root Vectors Group",
  SHAPE_CONTENTS: "ADBE Vectors Group",
  MARKER: "ADBE Marker"
} as const;
