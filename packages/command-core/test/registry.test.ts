import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../src/index.js";
import type { CommandDef } from "../src/index.js";

const def = (over: Partial<CommandDef>): CommandDef => ({
  id: "x.y",
  title: "X Y",
  module: "project",
  fn: "y",
  scope: "project",
  mutating: false,
  batch: false,
  category: "Test",
  ...over
});

describe("CommandRegistry", () => {
  it("registers and looks up commands, rejecting bad ids and duplicates", () => {
    const r = new CommandRegistry();
    r.register(def({ id: "layers.renameBatch", title: "Batch rename layers" }));
    expect(r.has("layers.renameBatch")).toBe(true);
    expect(r.get("layers.renameBatch").title).toBe("Batch rename layers");
    expect(() => r.register(def({ id: "layers.renameBatch" }))).toThrow(/Duplicate/);
    expect(() => r.register(def({ id: "no-dots-here" }))).toThrow(/Invalid command id/);
    expect(() => r.get("missing.thing")).toThrow(/Unknown command/);
  });

  it("requires batch commands to declare a scope", () => {
    const r = new CommandRegistry();
    expect(() => r.register(def({ id: "a.batch", batch: true, scope: "none" }))).toThrow(
      /must declare a scope/
    );
  });

  it("lists categories and all commands in stable order", () => {
    const r = new CommandRegistry();
    r.register(def({ id: "b.two", category: "Layers" }));
    r.register(def({ id: "a.one", category: "Project" }));
    expect(r.all().map((d) => d.id)).toEqual(["a.one", "b.two"]);
    expect(r.categories()).toEqual(["Layers", "Project"]);
  });
});
