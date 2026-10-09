import type {
  AeCompItem,
  AeItem,
  AeLayer,
  AeMarkerCollection,
  AeMarkerValue
} from "@operator/ae-types";
import { MockItem } from "./item.js";
import { MockLayer, linkParents } from "./layer.js";
import type { MockCompSpec, MockLayerSpec } from "./spec.js";

/**
 * MockMarkerCollection — comp markers addressed by index (docs/03 §11).
 * AE's native surface is an object keyed by time; we keep a sorted array and
 * expose the same set/remove operations handlers rely on.
 */
export class MockMarkerCollection implements AeMarkerCollection {
  _markers: AeMarkerValue[] = [];

  get numMarkers(): number {
    return this._markers.length;
  }

  marker(index: number): AeMarkerValue {
    const m = this._markers[index - 1];
    if (!m) throw new Error(`marker index out of range: ${index}`);
    return { ...m };
  }

  setValueAtTime(time: number, value: Omit<AeMarkerValue, "time">): void {
    const next: AeMarkerValue = {
      time,
      duration: value.duration ?? 0,
      comment: value.comment ?? "",
      chapter: value.chapter ?? "",
      url: value.url ?? "",
      frameTarget: value.frameTarget ?? ""
    };
    for (let i = 0; i < this._markers.length; i++) {
      if (this._markers[i].time === time) {
        this._markers[i] = next;
        return;
      }
    }
    this._markers.push(next);
    this._markers.sort((a, b) => a.time - b.time);
  }

  removeAtTime(time: number): void {
    const at = this._markers.findIndex((m) => m.time === time);
    if (at !== -1) this._markers.splice(at, 1);
  }
}

/** Mock composition. The layer stack is 1-indexed and re-indexed on removal. */
export class MockComp extends MockItem implements AeCompItem {
  override typeName: "Composition" = "Composition";
  width: number;
  height: number;
  frameRate: number;
  duration: number;
  displayStartTime: number;
  bgColor: number[];
  pixelAspect: number;
  shutterAngle: number;
  motionBlur: boolean;
  bitsPerChannel: number;
  markerProperty: MockMarkerCollection = new MockMarkerCollection();
  _layers: MockLayer[] = [];

  constructor(id: number, spec: MockCompSpec) {
    super(id, spec.name);
    this.typeName = "Composition";
    this.width = spec.width ?? 1920;
    this.height = spec.height ?? 1080;
    this.frameRate = spec.frameRate ?? 30;
    this.duration = spec.duration ?? 10;
    this.displayStartTime = spec.displayStartTime ?? 0;
    this.bgColor = spec.bgColor ?? [0, 0, 0];
    this.pixelAspect = spec.pixelAspect ?? 1;
    this.shutterAngle = 180;
    this.motionBlur = spec.motionBlur === true;
    this.bitsPerChannel = spec.bitsPerChannel ?? 1;
    this.label = spec.label ?? 0;
    this.comment = spec.comment ?? "";
    let index = 0;
    for (const layerSpec of spec.layers ?? []) {
      index++;
      this._layers.push(new MockLayer(layerSpec, index, this.duration, this));
    }
    linkParents(this._layers);
    for (const m of spec.markers ?? []) {
      this.markerProperty.setValueAtTime(m.time, {
        duration: m.duration ?? 0,
        comment: m.comment ?? "",
        chapter: m.chapter ?? "",
        url: m.url ?? "",
        frameTarget: m.frameTarget ?? ""
      });
    }
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

  /** Append a layer (used by comp builders and the data studio). */
  addLayer(spec: MockLayerSpec): MockLayer {
    const layer = new MockLayer(spec, this._layers.length + 1, this.duration, this);
    this._layers.push(layer);
    return layer;
  }

  /** A comp contributes no source footage of its own. */
  get source(): AeItem | null {
    return null;
  }

  openInViewer(): unknown {
    return null;
  }
}
