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
  EVENTS: "cep.plugplugEvents"
} as const;

export type CapabilityKey = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

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
