import { CommandRegistry } from "@operator/command-core";

/**
 * Phase 0/1 command catalog — the Phase 0 commands that prove the Host
 * Adapter + task protocol (docs/05 Phase 0 exit criteria), registered
 * exactly as the command-core contract requires: id, scope predicate,
 * params, undo policy, audit metadata (docs/02 §2.2). Grows to ~120
 * commands by MVP (docs/03).
 */
export function createCatalog(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.registerAll([
    {
      id: "project.info",
      title: "Project info",
      module: "project",
      fn: "info",
      scope: "project",
      mutating: false,
      batch: false,
      category: "Project",
      description: "Item counts by type, active comp, project path (read-only)."
    },
    {
      id: "comps.list",
      title: "List comps",
      module: "comps",
      fn: "list",
      scope: "project",
      mutating: false,
      batch: false,
      category: "Comps",
      description: "All compositions with settings (read-only)."
    },
    {
      id: "layers.renameBatch",
      title: "Batch rename layers",
      module: "layers",
      fn: "renameBatch",
      scope: "selection",
      mutating: true,
      batch: true,
      category: "Layers",
      description:
        "Pattern rename across the selection or a comp — dry-run preview, one undo group, chunked with progress.",
      params: [
        { key: "scope", type: "enum", enumValues: ["selection", "comp"], def: "selection" },
        { key: "pattern", type: "object", required: true, hint: "mode: prefix|suffix|replace|number" }
      ]
    },
    {
      id: "layers.sortBatch",
      title: "Sort layers",
      module: "layers",
      fn: "sortBatch",
      scope: "comp",
      mutating: true,
      batch: true,
      category: "Layers",
      description:
        "Reorder the stack: numeric-aware name sort (asc/desc) or reverse. Defaults to the active comp, name ascending. Dry-run previews the from→to order; one undo step reverts.",
      params: [
        { key: "order", type: "enum", enumValues: ["name-asc", "name-desc", "reverse"], def: "name-asc" },
        { key: "compId", type: "number", hint: "defaults to the active comp" }
      ]
    },
    {
      id: "layers.selectByPattern",
      title: "Select layers by name pattern",
      module: "layers",
      fn: "selectByPattern",
      scope: "comp",
      mutating: true,
      batch: true,
      category: "Layers",
      description:
        "Select layers whose names contain a find string (or match a regex). Replace or add to the current selection; case-insensitive by default.",
      params: [
        { key: "find", type: "string", required: true },
        { key: "regex", type: "boolean", def: false },
        { key: "caseSensitive", type: "boolean", def: false },
        { key: "mode", type: "enum", enumValues: ["replace", "add"], def: "replace" },
        { key: "compId", type: "number", hint: "defaults to the active comp" }
      ]
    },
    {
      id: "layers.deselectAll",
      title: "Deselect all layers",
      module: "layers",
      fn: "deselectAll",
      scope: "comp",
      mutating: true,
      batch: true,
      category: "Layers",
      description: "Clear the active comp's layer selection (or a targeted comp by id).",
      params: [{ key: "compId", type: "number", hint: "defaults to the active comp" }]
    },
    {
      id: "assets.doctorScan",
      title: "Asset Doctor: scan project",
      module: "assets",
      fn: "doctorScan",
      scope: "project",
      mutating: false,
      batch: true,
      category: "Asset Doctor",
      description:
        "One-click project audit: missing media, unused footage, duplicate sources, broken expressions. Read-only, chunked with progress; findings feed the fix-commands (docs/03 §1)."
    },
    {
      id: "assets.relinkMissing",
      title: "Asset Doctor: relink footage",
      module: "assets",
      fn: "relinkMissing",
      scope: "project",
      mutating: true,
      batch: true,
      category: "Asset Doctor",
      description:
        "Re-point footage items at new file paths by item id. Validates targets on the host, dry-run previews, one undo step reverts the whole batch.",
      params: [{ key: "entries", type: "object", required: true, hint: "[{ itemId, path }]" }]
    },
    {
      id: "assets.removeUnused",
      title: "Asset Doctor: remove unused footage",
      module: "assets",
      fn: "removeUnused",
      scope: "project",
      mutating: true,
      batch: true,
      category: "Asset Doctor",
      description:
        "Delete every footage/solid item no layer references. Dry-run preview first; one undo step reverts the whole batch."
    }
  ]);
  return registry;
}
