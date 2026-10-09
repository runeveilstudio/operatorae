import type {
  AeFile,
  AeFolderItem,
  AeFootageItem,
  AeItem,
  AeItemType
} from "@operator/ae-types";

/**
 * Project-panel item classes. Mirrors the AE rules handlers depend on:
 *  - item collections are 1-indexed (`item(i)`), counts come from `numItems`;
 *  - `Folder.items` is a real JS Array of direct children (AE exposes this);
 *  - a missing item is footage whose `file` is null or `exists === false`.
 *  - `remove()` drops the item from the project (the mock is permissive where
 *    real AE throws on in-use items; handlers must verify usage themselves).
 */

/** The project containers an item must be spliced out of on remove(). */
export interface MockItemOwner {
  _all: AeItem[];
  _root: AeItem[];
}

export class MockItem implements AeItem {
  id: number;
  name: string;
  typeName: AeItemType = "Footage";
  selected = false;
  label = 0;
  comment = "";
  parentFolder: AeFolderItem | null = null;
  file: AeFile | null = null;
  /** Set by MockProjectImpl on adoption; drives remove(). */
  _owner: MockItemOwner | null = null;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }

  remove(): void {
    const owner = this._owner;
    if (owner === null) return;
    const allAt = owner._all.indexOf(this);
    if (allAt !== -1) owner._all.splice(allAt, 1);
    const folder = this.parentFolder;
    if (folder !== null && typeof folder === "object") {
      const items = (folder as MockFolder)._items;
      const at = items.indexOf(this);
      if (at !== -1) items.splice(at, 1);
    } else {
      const rootAt = owner._root.indexOf(this);
      if (rootAt !== -1) owner._root.splice(rootAt, 1);
    }
    this._owner = null;
  }
}

export class MockFolder extends MockItem implements AeFolderItem {
  override typeName: "Folder" = "Folder";
  _items: AeItem[] = [];

  constructor(id: number, name: string) {
    super(id, name);
    this.typeName = "Folder";
  }

  get numItems(): number {
    return this._items.length;
  }

  item(index: number): AeItem {
    if (index < 1 || index > this._items.length) {
      throw new Error(`item index out of range: ${index}`);
    }
    return this._items[index - 1];
  }

  get items(): AeItem[] {
    return this._items;
  }
}

export class MockFootage extends MockItem implements AeFootageItem {
  override typeName: "Footage" | "Solid" = "Footage";
  width: number;
  height: number;
  duration: number;
  frameRate: number;
  hasVideo: boolean;
  hasAudio: boolean;
  /** Solid sources carry the fill color (real AE: mainSource.color). */
  mainSource: { color?: number[] } | null;

  constructor(
    id: number,
    name: string,
    opts: {
      file?: AeFile | null;
      solid?: boolean;
      width?: number;
      height?: number;
      duration?: number;
      frameRate?: number;
      hasVideo?: boolean;
      hasAudio?: boolean;
      solidColor?: number[];
    } = {}
  ) {
    super(id, name);
    this.file = opts.file ?? null;
    if (opts.solid === true) this.typeName = "Solid";
    this.mainSource = opts.solid === true ? { color: opts.solidColor ?? [0, 0, 0] } : null;
    this.width = opts.width ?? 1920;
    this.height = opts.height ?? 1080;
    this.duration = opts.duration ?? 10;
    this.frameRate = opts.frameRate ?? 30;
    this.hasVideo = opts.hasVideo !== false;
    this.hasAudio = opts.hasAudio === true;
  }

  /** Re-point the main source (the relink primitive). The mock keeps the
   * item's existing metadata; real AE re-reads it from disk. */
  replace(file: AeFile): void {
    this.file = file;
  }
}

/** Depth-first walk over a folder tree, yielding every descendant item. */
export function walkItems(root: AeFolderItem, visit: (item: AeItem) => void): void {
  for (const child of root.items) {
    visit(child);
    if (child.typeName === "Folder") walkItems(child as AeFolderItem, visit);
  }
}
