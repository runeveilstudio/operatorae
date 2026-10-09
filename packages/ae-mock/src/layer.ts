import type { AeEffect, AeItem, AeLayer, AeLayerType, AeProperty } from "@operator/ae-types";
import { MockEffect, MockProperty, buildLayerProps } from "./property.js";
import type { MockLayerSpec } from "./spec.js";

/** Default internal class per layer type (matchNames are AE's own). */
const LAYER_MATCH_NAMES: Record<string, string> = {
  text: "ADBE Text Layer",
  shape: "ADBE Shape Layer",
  camera: "ADBE Camera Layer",
  light: "ADBE Light Layer",
  adjustment: "ADBE Adjustment Layer",
  null: "ADBE Null Layer",
  av: "ADBE AV Layer"
};

/**
 * Mock layer. Owns a property tree (Transform, Text/Contents…) and an effect
 * list, and knows how to remove itself from its comp (AE's `layer.remove()`).
 * `remove()` re-indexes the stack so `layer(i)` stays 1-based and contiguous.
 */

export interface MockLayerOwner {
  _layers: MockLayer[];
}

export class MockLayer implements AeLayer {
  index: number;
  name: string;
  selected: boolean;
  locked: boolean;
  label: number;
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
  inPoint: number;
  outPoint: number;
  startTime: number;
  stretch: number;
  parent: AeLayer | null = null;
  comment: string;
  source: AeItem | null = null;
  _props: MockProperty[];
  _effects: MockEffect[] = [];
  _parentIndexHint: number | null;
  private readonly owner: MockLayerOwner;

  constructor(spec: MockLayerSpec, index: number, compDuration: number, owner: MockLayerOwner) {
    this.owner = owner;
    this.index = index;
    this.name = spec.name;
    this.selected = spec.selected === true;
    this.locked = spec.locked === true;
    this.label = spec.label ?? 0;
    this.layerType = spec.layerType ?? "av";
    this.matchName =
      spec.matchName ?? LAYER_MATCH_NAMES[this.layerType] ?? "ADBE AV Layer";
    this.enabled = spec.enabled !== false;
    this.hasVideo = spec.hasVideo !== false;
    this.hasAudio = spec.hasAudio === true;
    this.threeDLayer = spec.threeDLayer === true;
    this.shy = spec.shy === true;
    this.solo = spec.solo === true;
    this.motionBlur = spec.motionBlur === true;
    this.adjustmentLayer = spec.adjustmentLayer === true || this.layerType === "adjustment";
    this.guideLayer = spec.guideLayer === true;
    this.startTime = spec.startTime ?? 0;
    this.inPoint = spec.inPoint ?? 0;
    this.outPoint = spec.outPoint ?? compDuration;
    this.stretch = spec.stretch ?? 100;
    this.comment = spec.comment ?? "";
    this._props = buildLayerProps(spec);
    let effectIndex = 0;
    for (const e of spec.effects ?? []) {
      effectIndex++;
      this._effects.push(new MockEffect(e, effectIndex, this));
    }
    this._parentIndexHint = spec.parentIndex ?? null;
  }

  get numProperties(): number {
    return this._props.length;
  }

  property(nameOrIndex: string | number): AeProperty {
    if (typeof nameOrIndex === "number") {
      if (nameOrIndex < 1 || nameOrIndex > this._props.length) {
        throw new Error(`property index out of range: ${nameOrIndex}`);
      }
      return this._props[nameOrIndex - 1];
    }
    for (const p of this._props) {
      if (p.matchName === nameOrIndex) return p;
    }
    for (const p of this._props) {
      if (p.name === nameOrIndex) return p;
    }
    throw new Error(`property not found on layer "${this.name}": "${nameOrIndex}"`);
  }

  /** Non-throwing property lookup for sweeps (Asset Doctor, expression audit). */
  tryProp(matchOrName: string): MockProperty | null {
    for (const p of this._props) {
      if (p.matchName === matchOrName || p.name === matchOrName) return p as MockProperty;
    }
    return null;
  }

  get numEffects(): number {
    return this._effects.length;
  }

  effect(nameOrIndex: string | number): AeEffect {
    if (typeof nameOrIndex === "number") {
      if (nameOrIndex < 1 || nameOrIndex > this._effects.length) {
        throw new Error(`effect index out of range: ${nameOrIndex}`);
      }
      return this._effects[nameOrIndex - 1];
    }
    for (const e of this._effects) {
      if (e.name === nameOrIndex || e.matchName === nameOrIndex) return e;
    }
    throw new Error(`effect not found on layer "${this.name}": "${nameOrIndex}"`);
  }

  /** Convenience used by fixtures/handlers that need the value leaf. */
  get opacity(): MockProperty | null {
    return this.tryProp("ADBE Opacity");
  }

  remove(): void {
    const at = this.owner._layers.indexOf(this);
    if (at === -1) return;
    this.owner._layers.splice(at, 1);
    for (let i = 0; i < this.owner._layers.length; i++) {
      this.owner._layers[i].index = i + 1;
    }
  }

  /** Top of the stack, then re-index so `layer(i)` stays 1-based. */
  moveToBeginning(): void {
    const at = this.owner._layers.indexOf(this);
    if (at === -1) return;
    this.owner._layers.splice(at, 1);
    this.owner._layers.unshift(this);
    for (let i = 0; i < this.owner._layers.length; i++) {
      this.owner._layers[i].index = i + 1;
    }
  }
}

/** Resolve `parentIndex` hints into real layer references once a comp is built. */
export function linkParents(layers: MockLayer[]): void {
  for (const layer of layers) {
    const hint = layer._parentIndexHint;
    if (hint === null) continue;
    if (hint < 1 || hint > layers.length) continue;
    const target = layers[hint - 1];
    if (target !== layer) layer.parent = target;
  }
}
