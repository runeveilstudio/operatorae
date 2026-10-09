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
      id: "assets.doctorScan",
      title: "Asset Doctor: scan project",
      module: "assets",
      fn: "doctorScan",
      scope: "project",
      mutating: false,
      batch: true,
      category: "Asset Doctor",
      description:
        "One-click project audit: missing media, unused footage, broken expressions. Read-only, chunked with progress; findings feed the fix-commands (docs/03 §1)."
    }
  ]);
  return registry;
}
