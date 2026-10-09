/**
 * Host capability probe (docs/01 principle 4: feature-detect, never
 * version-assume). Probed by the JSX runtime at startup; the panel disables
 * (never hides) commands whose capability is false, with a reason tooltip.
 */
export const CAPABILITIES = {
  PROJECT: "ae.project",
  UNDO_GROUPS: "ae.undoGroups",
  SCHEDULE_TASK: "ae.scheduleTask",
  ACTIVE_COMP: "ae.activeComp",
  EVENTS: "cep.plugplugEvents",
  // Domain gates (docs/03). Each maps to a probed AE API surface; the palette
  // disables (never hides) commands whose gate is false (docs/01 principle 4).
  ITEMS: "ae.items",
  LAYERS: "ae.layers",
  LAYER_TOGGLES: "ae.layerToggles",
  LAYER_LABELS: "ae.layerLabels",
  KEYFRAMES: "ae.keyframes",
  TEXT_LAYERS: "ae.textLayers",
  SHAPES: "ae.shapes",
  EFFECTS: "ae.effects",
  EXPRESSIONS: "ae.expressions",
  MARKERS: "ae.markers",
  RENDER_QUEUE: "ae.renderQueue",
  LABELS: "ae.labels",
  ESSENTIAL_PROPERTIES: "ae.essentialProperties"
} as const;

export type CapabilityKey = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

/** Stable display metadata for the status panel / diagnostics bundle. */
export const CAPABILITY_LABELS: Record<string, string> = {
  [CAPABILITIES.PROJECT]: "Project DOM",
  [CAPABILITIES.UNDO_GROUPS]: "Undo groups",
  [CAPABILITIES.SCHEDULE_TASK]: "Cooperative scheduling",
  [CAPABILITIES.ACTIVE_COMP]: "Active composition",
  [CAPABILITIES.EVENTS]: "CEP progress events",
  [CAPABILITIES.ITEMS]: "Project items + folders",
  [CAPABILITIES.LAYERS]: "Layer collection",
  [CAPABILITIES.LAYER_TOGGLES]: "Layer toggles (shy/solo/3D)",
  [CAPABILITIES.LAYER_LABELS]: "Layer label colors",
  [CAPABILITIES.KEYFRAMES]: "Keyframe streams",
  [CAPABILITIES.TEXT_LAYERS]: "Text layers",
  [CAPABILITIES.SHAPES]: "Shape layers",
  [CAPABILITIES.EFFECTS]: "Effect properties",
  [CAPABILITIES.EXPRESSIONS]: "Expressions",
  [CAPABILITIES.MARKERS]: "Comp markers",
  [CAPABILITIES.RENDER_QUEUE]: "Render queue",
  [CAPABILITIES.LABELS]: "Label color palette",
  [CAPABILITIES.ESSENTIAL_PROPERTIES]: "Essential Properties"
};

export interface HostProbe {
  engine: "ExtendScript";
  appVersion: string;
  /** $.os from ExtendScript, passed through untouched. */
  platform: string;
  capabilities: Record<string, boolean>;
}

export function hasCapability(probe: HostProbe, key: CapabilityKey | string): boolean {
  return probe.capabilities[key] === true;
}
