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
 */

export class MockItem implements AeItem {
  id: number;
  name: string;
  typeName: AeItemType = "Footage";
  selected = false;
  label = 0;
  comment = "";
  parentFolder: AeFolderItem | null = null;
  file: AeFile | null = null;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
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
    } = {}
  ) {
    super(id, name);
    this.file = opts.file ?? null;
    if (opts.solid === true) this.typeName = "Solid";
    this.width = opts.width ?? 1920;
    this.height = opts.height ?? 1080;
    this.duration = opts.duration ?? 10;
    this.frameRate = opts.frameRate ?? 30;
    this.hasVideo = opts.hasVideo !== false;
    this.hasAudio = opts.hasAudio === true;
  }
}

/** Depth-first walk over a folder tree, yielding every descendant item. */
export function walkItems(root: AeFolderItem, visit: (item: AeItem) => void): void {
  for (const child of root.items) {
    visit(child);
    if (child.typeName === "Folder") walkItems(child as AeFolderItem, visit);
  }
}
