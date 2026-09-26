import type { CommandDef } from "./types.js";
import { CommandNotFoundError } from "./types.js";
import { fuzzyScore } from "./fuzzy.js";

export interface SearchResult {
  def: CommandDef;
  score: number;
}

const ID_PATTERN = /^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+$/;

export class CommandRegistry {
  private readonly defs = new Map<string, CommandDef>();

  register(def: CommandDef): void {
    if (!ID_PATTERN.test(def.id)) {
      throw new Error(`Invalid command id: "${def.id}" (expected dotted segments)`);
    }
    if (this.defs.has(def.id)) {
      throw new Error(`Duplicate command id: ${def.id}`);
    }
    if (def.batch && def.scope === "none") {
      throw new Error(`Batch command ${def.id} must declare a scope`);
    }
    this.defs.set(def.id, { ...def });
  }

  registerAll(defs: CommandDef[]): void {
    for (const d of defs) this.register(d);
  }

  get(id: string): CommandDef {
    const def = this.defs.get(id);
    if (!def) throw new CommandNotFoundError(id);
    return def;
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  all(): CommandDef[] {
    return [...this.defs.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  categories(): string[] {
    const cats = new Set<string>();
    for (const d of this.defs.values()) cats.add(d.category);
    return [...cats].sort();
  }

  search(query: string, limit = 50): SearchResult[] {
    const q = query.trim();
    if (!q) {
      return this.all().slice(0, limit).map((def) => ({ def, score: 0 }));
    }
    const scored: SearchResult[] = [];
    for (const def of this.defs.values()) {
      const haystack = `${def.category} ${def.title} ${def.id}`;
      const score = fuzzyScore(q, haystack);
      if (score > 0) scored.push({ def, score });
    }
    scored.sort((a, b) => b.score - a.score || a.def.id.localeCompare(b.def.id));
    return scored.slice(0, limit);
  }
}
