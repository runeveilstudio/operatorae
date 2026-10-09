import type {
  AeEffect,
  AeProperty,
  AePropertyValue,
  AeTextDocument
} from "@operator/ae-types";
import type { MockEffectSpec, MockLayerSpec, MockPropSpec } from "./spec.js";

/**
 * Mock property tree. Mirrors the AE rules handlers rely on:
 *  - `property(i)` is 1-indexed; `property("ADBE Opacity")` matches matchName
 *    first, then display name (case-insensitively as a last resort).
 *  - Reading `.value` on a group throws (AE does the same) — handlers must
 *    walk to a leaf.
 *  - Reading a value returns a COPY, so handler code cannot mutate the project
 *    by aliasing (mirrors AE's value semantics).
 */

const GROUP_TYPES: Record<string, true> = {
  Group: true,
  "Named Group": true,
  NoValue: true
};

function isGroupType(t: string): boolean {
  return GROUP_TYPES[t] === true;
}

function cloneValue(value: AePropertyValue): AePropertyValue {
  if (value === null) return null;
  if (value instanceof Array) return value.slice();
  if (typeof value === "object") return { ...(value as AeTextDocument) };
  return value;
}

export interface MockKeyframe {
  time: number;
  value: number | number[] | string;
}

export class MockProperty implements AeProperty {
  name: string;
  matchName: string;
  propertyType: string;
  expression: string;
  expressionError: string;
  expressionEnabled: boolean;
  canSetExpression: boolean;
  _children: MockProperty[];
  _keys: MockKeyframe[];
  protected _value: AePropertyValue;

  constructor(spec: MockPropSpec) {
    this.name = spec.name;
    this.matchName = spec.matchName;
    this._children = (spec.children ?? []).map((c) => new MockProperty(c));
    this.propertyType =
      spec.propertyType ?? (this._children.length > 0 ? "Group" : "OneD");
    this._value = spec.value === undefined ? null : cloneValue(spec.value);
    this._keys = (spec.keys ?? []).map((k) => ({ time: k.time, value: k.value }));
    this.expression = spec.expression ?? "";
    this.expressionError = spec.expressionError ?? "";
    this.expressionEnabled = this.expression !== "";
    this.canSetExpression = spec.canSetExpression !== false;
  }

  get numProperties(): number {
    return this._children.length;
  }

  get active(): boolean {
    return true;
  }

  /** True when this node is a container rather than a value. */
  get isGroup(): boolean {
    return this._children.length > 0 || isGroupType(this.propertyType);
  }

  get value(): AePropertyValue {
    if (this.isGroup) {
      throw new Error(`Cannot read value of property group "${this.name}" (${this.matchName})`);
    }
    return cloneValue(this._value);
  }

  set value(next: AePropertyValue) {
    if (this.isGroup) {
      throw new Error(`Cannot set value of property group "${this.name}" (${this.matchName})`);
    }
    this._value = cloneValue(next);
  }

  property(nameOrIndex: string | number): AeProperty {
    return this.find(nameOrIndex);
  }

  /** Internal: returns this tree's matched child, or throws (AE behaviour). */
  find(nameOrIndex: string | number): MockProperty {
    if (typeof nameOrIndex === "number") {
      if (nameOrIndex < 1 || nameOrIndex > this._children.length) {
        throw new Error(`property index out of range: ${nameOrIndex}`);
      }
      return this._children[nameOrIndex - 1];
    }
    for (const c of this._children) {
      if (c.matchName === nameOrIndex) return c;
    }
    for (const c of this._children) {
      if (c.name === nameOrIndex) return c;
    }
    const lower = nameOrIndex.toLowerCase();
    for (const c of this._children) {
      if (c.name.toLowerCase() === lower) return c;
    }
    throw new Error(`property not found: "${nameOrIndex}" (in "${this.name}")`);
  }

  /** Non-throwing sibling of `find`, used by audit/sweeper passes. */
  tryFind(nameOrMatch: string): MockProperty | null {
    for (const c of this._children) {
      if (c.matchName === nameOrMatch || c.name === nameOrMatch) return c;
    }
    return null;
  }

  get numKeys(): number {
    return this._keys.length;
  }

  keyTime(index: number): number {
    const k = this._keys[index - 1];
    if (!k) throw new Error(`key index out of range: ${index}`);
    return k.time;
  }

  keyValue(index: number): AePropertyValue {
    const k = this._keys[index - 1];
    if (!k) throw new Error(`key index out of range: ${index}`);
    return cloneValue(k.value);
  }

  /** 1-based index of the nearest key, or 0 when the property has no keys. */
  nearestKeyIndex(time: number): number {
    let best = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < this._keys.length; i++) {
      const delta = Math.abs(this._keys[i].time - time);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = i + 1;
      }
    }
    return best;
  }

  setValueAtTime(time: number, value: AePropertyValue): void {
    if (this.isGroup) {
      throw new Error(`Cannot key a property group: "${this.name}"`);
    }
    const asKeyValue = value as number | number[] | string | null;
    if (asKeyValue === null || typeof asKeyValue === "boolean" || typeof asKeyValue === "object") {
      throw new Error(`Unsupported keyframe value on "${this.matchName}"`);
    }
    for (const k of this._keys) {
      if (k.time === time) {
        k.value = cloneValue(asKeyValue) as number | number[] | string;
        return;
      }
    }
    this._keys.push({ time, value: cloneValue(asKeyValue) as number | number[] | string });
    this._keys.sort((a, b) => a.time - b.time);
  }

  removeKey(index: number): void {
    if (index < 1 || index > this._keys.length) {
      throw new Error(`key index out of range: ${index}`);
    }
    this._keys.splice(index - 1, 1);
  }
}

/** Effects are property groups that can be enabled and removed. */
export class MockEffect extends MockProperty implements AeEffect {
  effectIndex: number;
  enabled: boolean;
  private readonly owner: { _effects: MockEffect[] };

  constructor(spec: MockEffectSpec, effectIndex: number, owner: { _effects: MockEffect[] }) {
    super({ ...spec, propertyType: spec.propertyType ?? "Group" });
    this.effectIndex = effectIndex;
    this.enabled = spec.enabled !== false;
    this.owner = owner;
  }

  remove(): void {
    const at = this.owner._effects.indexOf(this);
    if (at !== -1) this.owner._effects.splice(at, 1);
  }
}

const DEFAULT_TEXT: AeTextDocument = {
  text: "Text",
  font: "Helvetica",
  fontSize: 72,
  fillColor: [1, 1, 1],
  strokeColor: [0, 0, 0],
  strokeWidth: 0,
  applyFill: true,
  applyStroke: false,
  tracking: 0,
  leading: 0,
  justification: "left",
  allCaps: false,
  smallCaps: false,
  boxText: false
};

export function defaultTextDocument(spec: Partial<AeTextDocument> | undefined): AeTextDocument {
  return { ...DEFAULT_TEXT, ...(spec ?? {}) };
}

/** The Transform group every layer has (matchNames are AE's, locale-proof).
 * `spec` is accepted so per-layer transform overrides can land here without
 * touching call sites (reserved). */
function transformGroup(_spec: MockLayerSpec): MockPropSpec {
  return {
    name: "Transform",
    matchName: "ADBE Transform Group",
    propertyType: "Group",
    children: [
      { name: "Anchor Point", matchName: "ADBE Anchor Point", propertyType: "ThreeD", value: [0, 0, 0] },
      { name: "Position", matchName: "ADBE Position", propertyType: "ThreeD", value: [960, 540, 0] },
      { name: "Scale", matchName: "ADBE Scale", propertyType: "ThreeD", value: [100, 100, 100] },
      { name: "Rotation", matchName: "ADBE Rotate Z", propertyType: "OneD", value: 0 },
      { name: "Opacity", matchName: "ADBE Opacity", propertyType: "OneD", value: 100 }
    ]
  };
}

function textGroup(spec: MockLayerSpec): MockPropSpec {
  return {
    name: "Text",
    matchName: "ADBE Text Properties",
    propertyType: "Group",
    children: [
      {
        name: "Source Text",
        matchName: "ADBE Text Document",
        propertyType: "TextDocument",
        value: defaultTextDocument(spec.text)
      }
    ]
  };
}

/** Build a layer's default property tree, then merge the spec's overrides. */
export function buildLayerProps(spec: MockLayerSpec): MockProperty[] {
  const trees: MockPropSpec[] = [transformGroup(spec)];
  if (spec.layerType === "text") trees.push(textGroup(spec));
  if (spec.layerType === "shape") {
    trees.push({
      name: "Contents",
      matchName: "ADBE Root Vectors Group",
      propertyType: "Group",
      children: []
    });
  }
  for (const override of spec.props ?? []) {
    if (!mergePropSpec(trees, override)) trees.push(override);
  }
  return trees.map((t) => new MockProperty(t));
}

/**
 * Merge an override spec into a tree by matchName. Returns true when a node
 * consumed it (possibly deep); the caller appends when absent. Merging into
 * a descendant must NOT also append at ancestor levels — that used to create
 * phantom duplicate properties (caught by the Asset Doctor expression walk).
 */
function mergePropSpec(trees: MockPropSpec[], override: MockPropSpec): boolean {
  for (const node of trees) {
    if (node.matchName === override.matchName) {
      if (override.value !== undefined) node.value = override.value;
      if (override.keys !== undefined) node.keys = override.keys;
      if (override.expression !== undefined) node.expression = override.expression;
      if (override.expressionError !== undefined) node.expressionError = override.expressionError;
      if (override.canSetExpression !== undefined) node.canSetExpression = override.canSetExpression;
      if (override.children !== undefined) {
        node.children = node.children ?? [];
        for (const child of override.children) {
          if (!mergePropSpec(node.children, child)) node.children.push(child);
        }
      }
      return true;
    }
    if (node.children && mergePropSpec(node.children, override)) return true;
  }
  return false;
}
