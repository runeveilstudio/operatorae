/**
 * Project item model (docs/02 §2.3, docs/03 §1). Project panel entities are
 * 1-indexed and form a folder tree; `file` is null for solids/comps/folders.
 * `fileURI` on the project is a percent-encoded string, never a File object.
 */

import type { AeCompItem } from "./layers.js";

export type AeItemType = "Composition" | "Footage" | "Folder" | "Solid" | string;

export interface AeFile {
  /** Native OS path (backslashes on Windows, as AE reports it). */
  fsName: string;
  name: string;
  displayName: string;
  /** Percent-encoded URI form AE uses in `file`/`project.file`. */
  absoluteURI?: string;
  exists: boolean;
}

export interface AeItem {
  id: number;
  name: string;
  typeName: AeItemType;
  selected: boolean;
  /** Label color id (0 = none). See `app.project` label palette. */
  label: number;
  comment: string;
  parentFolder: AeFolderItem | null;
  /** Percent-encoded URI string, or "" for folder/solid/composition. */
  file: AeFile | null;
  /** Deletes the item from the project. AE throws when the item is in use. */
  remove(): void;
}

export interface AeFolderItem extends AeItem {
  typeName: "Folder";
  numItems: number;
  item(index: number): AeItem;
  /** Real JS Array of direct children (useful for recursive walks). */
  items: AeItem[];
}

export interface AeFootageItem extends AeItem {
  typeName: "Footage" | "Solid";
  file: AeFile | null;
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  frameRate: number;
  hasVideo: boolean;
  hasAudio: boolean;
  /** Re-points the main source at `file` (the relink primitive, docs/03 §1). */
  replace(file: AeFile): void;
}

export interface AeMarkerValue {
  /** Seconds, relative to comp start. */
  time: number;
  /** Seconds; 0 = single-frame marker. */
  duration: number;
  comment: string;
  chapter: string;
  url: string;
  frameTarget: string;
}

/** Comp marker collection (docs/03 §11). Simplified: AE's native surface is
 * an object keyed by time; we expose an index + explicit set/remove. */
export interface AeMarkerCollection {
  numMarkers: number;
  marker(index: number): AeMarkerValue;
  setValueAtTime(time: number, value: Omit<AeMarkerValue, "time">): void;
  removeAtTime(time: number): void;
}

export function isFolder(item: AeItem): item is AeFolderItem {
  return item.typeName === "Folder";
}

export function isCompItem(item: AeItem): item is AeCompItem {
  return item.typeName === "Composition";
}

export function isFootage(item: AeItem): item is AeFootageItem {
  return item.typeName === "Footage" || item.typeName === "Solid";
}
