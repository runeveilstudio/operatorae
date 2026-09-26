import { describe, expect, it } from "vitest";
import { createMockAeEnv } from "@operator/ae-mock";
import { PROTOCOL_VERSION } from "@operator/protocol";
import { InProcessHostAdapter } from "../src/inproc.js";

function makeAdapter(chunkSize?: number) {
  const mock = createMockAeEnv({
    fileURI: "file:///proj/hello.aep",
    comps: [
      {
        name: "MAIN",
        active: true,
        layers: Array.from({ length: 5 }, (_, i) => ({
          name: `L${i + 1}`,
          selected: true
        }))
      }
    ]
  });
  const adapter = new InProcessHostAdapter(mock.app, "TestHost");
  return { mock, adapter, chunkSize };
}

describe("InProcessHostAdapter — full loop through the HostAdapter contract", () => {
  it("probes host info end-to-end", async () => {
    const { adapter } = makeAdapter();
    const info = await adapter.info();
    expect(info.host).toBe("MOCK");
    expect(info.projectPath).toBe("/proj/hello.aep");
    expect(info.capabilities["ae.project"]).toBe(true);
  });

  it("resolves immediate commands (the third proven command path)", async () => {
    const { adapter } = makeAdapter();
    const result = await adapter.runTask({ id: "p1", module: "project", fn: "info" });
    expect(result.ok).toBe(true);
  });

  it("runs chunked renames with live progress and reports the protocol version", async () => {
    const { mock, adapter } = makeAdapter();
    const seen: Array<{ done: number; total: number }> = [];
    adapter.onProgress((p) => seen.push({ done: p.done, total: p.total }));
    const result = await adapter.runTask({
      id: "p2",
      module: "layers",
      fn: "renameBatch",
      args: { scope: "selection", pattern: { mode: "prefix", text: "shot_" } },
      meta: { chunkSize: 2 }
    });
    expect(result.ok).toBe(true);
    expect(seen.length).toBe(3); // 5 layers / chunk 2 = 3 slices
    expect(seen[seen.length - 1]).toEqual({ done: 5, total: 5 });
    expect(mock.comps[0]._layers.map((l) => l.name)).toEqual([
      "shot_L1",
      "shot_L2",
      "shot_L3",
      "shot_L4",
      "shot_L5"
    ]);
    const ping = await new InProcessHostAdapter(mock.app).runTask({
      id: "p3",
      module: "system",
      fn: "ping"
    });
    expect((ping.data as { protocol: string }).protocol).toBe(PROTOCOL_VERSION);
  });

  it("supports cooperative cancel mid-batch through the adapter", async () => {
    const { mock, adapter } = makeAdapter();
    const pending = adapter.runTask({
      id: "p4",
      module: "layers",
      fn: "renameBatch",
      args: { scope: "comp", compId: 1, pattern: { mode: "suffix", text: "_x" } },
      meta: { chunkSize: 1 }
    });
    const off = adapter.onProgress(() => {
      off();
      void adapter.cancelTask("p4");
    });
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.errors?.[0].code).toBe("TASK_CANCELLED");
    const names = mock.comps[0]._layers.map((l) => l.name);
    expect(names.some((n) => n.endsWith("_x"))).toBe(true);
    expect(names.every((n) => n.endsWith("_x"))).toBe(false);
  });
});
