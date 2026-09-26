import type { CapabilityKey, TaskModuleId } from "@operator/protocol";

export type CommandScope = "none" | "project" | "comp" | "selection";

export interface ParamSpec {
  key: string;
  type: "string" | "number" | "boolean" | "enum" | "object";
  required?: boolean;
  def?: unknown;
  enumValues?: string[];
  hint?: string;
}

/**
 * Everything is a command (docs/01 principle 1): every UI action registers
 * here and becomes palette-searchable, macro-composable and SDK-callable.
 */
export interface CommandDef {
  /** Dotted id, e.g. "layers.renameBatch" — also the palette/macro key. */
  id: string;
  title: string;
  module: TaskModuleId;
  /** ExtendScript handler fn in that module. */
  fn: string;
  scope: CommandScope;
  mutating: boolean;
  /** Runs chunked with progress + cooperative cancel. */
  batch: boolean;
  category: string;
  /** Capability gate; commands disable (never hide) when missing (docs/02 §2.3). */
  capability?: CapabilityKey;
  params?: ParamSpec[];
  description?: string;
}

export class CommandNotFoundError extends Error {
  constructor(id: string) {
    super(`Unknown command: ${id}`);
    this.name = "CommandNotFoundError";
  }
}
