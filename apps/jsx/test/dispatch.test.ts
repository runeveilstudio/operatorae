import { describe, expect, it } from "vitest";
import { createMockAeEnv } from "@operator/ae-mock";
import { handlerTable } from "../src/index.js";
import { createOperator, type OperatorEnv } from "../src/core/operator.js";
import * as mirror from "../src/core/protocol.js";

interface Emitted {
  type: string;
  json: string;
}

function makeEnv(appOverride?: Partial<ReturnType<typeof createMockAeEnv>["app"]>) {
  const mock = createMockAeEnv({
    fileURI: "file:///Users/artist/Projects/night%20cut.aep",
    comps: [
      {
        name: "MAIN",
        active: true,
        layers: [
          { name: "hero", selected: true },
          { name: "bg", selected: true },
          { name: "locked matte", selected: true, locked: true },
          { name: "text" },
          { name: "text" },
          { name: "shadow" },
          { name: "glow" }
        ]
      },
      { name: "PREVIZ", layers: [{ name: "one" }] }
    ],
    footage: [{ name: "clip_a.mov" }, { name: "missing_link.mov", missing: true }]
  });
  const app = { ...mock.app, ...appOverride };
  const emitted: Emitted[] = [];
  const ticks: Array<{ id: string; fn: () => void }> = [];
  const env: OperatorEnv = {
    app,
    platform: "Mac OS X (mock)",
    eventsAvailable: true,
    emit: (type, json) => emitted.push({ type, json }),
    scheduleTick: (id, fn) => ticks.push({ id, fn }),
    now: () => Date.now()
  };
  const op = createOperator(env, handlerTable());
  return { op, mock: { ...mock, app }, env, emitted, ticks };
}

async function pump(ticks: Array<{ fn: () => void }>): Promise<void> {
  while (ticks.length > 0) {
    const t = ticks.shift();
    t!.fn();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const request = (id: string, module: string, fn: string, args?: unknown, meta?: unknown) =>
  JSON.stringify({ id, module, fn, args: args ?? null, meta: meta ?? null });

describe("dispatcher core", () => {
  it("runs immediate project.info with item counts and a decoded project path", () => {
    const { op } = makeEnv();
    const result = JSON.parse(
      op.run(request("t1", "project", "info"))
    ) as mirror.TaskResult & { data: Record<string, unknown> };
    expect(result.ok).toBe(true);
    expect(result.data.itemCount).toBe(4);
    expect(result.data.counts).toEqual({ comps: 2, footage: 2, folders: 0, solids: 0, other: 0 });
    expect(result.data.projectPath).toBe("/Users/artist/Projects/night cut.aep");
    expect(result.data.saved).toBe(true);
    expect((result.data.activeComp as { name: string }).name).toBe("MAIN");
  });

  it("runs comps.list with quirk-aware enumeration", () => {
    const { op } = makeEnv();
    const result = JSON.parse(op.run(request("t2", "comps", "list"))) as {
      ok: boolean;
      data: { comps: Array<{ name: string; numLayers: number }> };
    };
    expect(result.ok).toBe(true);
    expect(result.data.comps.map((c) => c.name)).toEqual(["MAIN", "PREVIZ"]);
    expect(result.data.comps[0].numLayers).toBe(7);
  });

  it("fails with typed envelopes for bad JSON, unknown modules and unknown fns", () => {
    const { op } = makeEnv();
    const badJson = JSON.parse(op.run("{nope")) as mirror.TaskResult;
    expect(badJson.ok).toBe(false);
    expect(badJson.errors[0].code).toBe("TASK_PROTOCOL");
    const badModule = JSON.parse(op.run(request("t3", "nope", "x"))) as mirror.TaskResult;
    expect(badModule.errors[0].code).toBe("TASK_MODULE_NOT_FOUND");
    const badFn = JSON.parse(op.run(request("t4", "layers", "nope"))) as mirror.TaskResult;
    expect(badFn.errors[0].code).toBe("TASK_FN_NOT_FOUND");
  });

  it("gates handlers on probed capabilities (feature-detect, never version-assume)", () => {
    const { op } = makeEnv({ scheduleTask: undefined } as never);
    const probed = JSON.parse(op.run(request("t5", "system", "probe"))) as {
      data: { capabilities: Record<string, boolean> };
    };
    expect(probed.data.capabilities[mirror.CAPABILITIES.SCHEDULE_TASK]).toBe(false);
    expect(probed.data.capabilities[mirror.CAPABILITIES.PROJECT]).toBe(true);
  });

  it("dry-run renameBatch previews without touching the project or opening undo", async () => {
    const { op, mock, emitted, ticks } = makeEnv();
    const ack = JSON.parse(
      op.run(request("t6", "layers", "renameBatch", { scope: "comp", compId: mock.comps[1].id, pattern: { mode: "prefix", text: "shot_" } }, { dryRun: true, chunkSize: 2 }))
    ) as mirror.TaskAccepted;
    expect(ack.accepted).toBe(true);
    await pump(ticks);
    const done = emitted.find((e) => e.type === mirror.TASK_DONE_EVENT)!;
    const result = JSON.parse(done.json) as mirror.TaskResult & {
      data: { renamed: number; preview: Array<{ from: string; to: string }>; dryRun: boolean };
    };
    expect(result.ok).toBe(true);
    expect(result.data.dryRun).toBe(true);
    expect(result.data.renamed).toBe(0);
    expect(result.data.preview).toEqual([{ from: "one", to: "shot_one", index: 1 }]);
    expect(mock.comps[1]._layers[0].name).toBe("one");
    expect(mock.undoLog.length).toBe(0);
  });

  it("renameBatch mutates inside one undo group with chunked progress events", async () => {
    const { op, mock, emitted, ticks } = makeEnv();
    const ack = JSON.parse(
      op.run(request("t7", "layers", "renameBatch", { scope: "selection", pattern: { mode: "number", text: "layer_", start: 10, pad: 3 } }, { chunkSize: 2 }))
    ) as mirror.TaskAccepted;
    expect(ack.accepted).toBe(true);
    await pump(ticks);
    const done = JSON.parse(emitted.find((e) => e.type === mirror.TASK_DONE_EVENT)!.json) as mirror.TaskResult & {
      data: { renamed: number; skipped: Array<{ layer: string; reason: string }>; undoToken?: string };
    } & { undoToken: string };
    expect(done.ok).toBe(true);
    expect(done.data.renamed).toBe(2); // hero + bg; locked matte skipped
    expect(done.data.skipped.length).toBe(1);
    expect(done.data.skipped[0].layer).toBe("locked matte");
    expect(done.undoToken).toBe("undo:t7");
    const names = mock.comps[0]._layers.map((l) => l.name);
    expect(names.slice(0, 2)).toEqual(["layer_010", "layer_011"]);
    expect(names[2]).toBe("locked matte");
    expect(mock.undoLog).toEqual(["begin:OPERATOR: layers.renameBatch", "end"]);
    const progressEvents = emitted.filter((e) => e.type === mirror.TASK_PROGRESS_EVENT);
    expect(progressEvents.length).toBe(2); // 3 items / chunkSize 2 -> 2 slices
  });

  it("cancel between chunks ends the undo group and reports partial state", async () => {
    const { op, mock, emitted, ticks } = makeEnv();
    op.run(request("t8", "layers", "renameBatch", { scope: "comp", compId: 1, pattern: { mode: "suffix", text: "_x" } }, { chunkSize: 1 }));
    // let exactly one slice run
    ticks.shift()!.fn();
    expect(op.cancel("t8")).toBe(true);
    expect(op.cancel("t8")).toBe(false); // already cancelling
    await pump(ticks);
    const done = JSON.parse(emitted.find((e) => e.type === mirror.TASK_DONE_EVENT)!.json) as mirror.TaskResult & {
      data: { processed: number; remainingAfterCancel: number };
    };
    expect(done.ok).toBe(false);
    expect(done.errors[0].code).toBe("TASK_CANCELLED");
    expect(done.data.processed).toBe(1);
    expect(done.data.remainingAfterCancel).toBe(6);
    expect(mock.undoLog).toEqual(["begin:OPERATOR: layers.renameBatch", "end"]);
    expect(mock.comps[0]._layers[0].name).toBe("hero_x");
    expect(mock.comps[0]._layers[1].name).toBe("bg");
  });

  it("rejects duplicate task ids and gives actionable scope errors", async () => {
    const { op, ticks } = makeEnv();
    op.run(request("t9", "layers", "renameBatch", { scope: "comp", compId: 1, pattern: { mode: "prefix", text: "a_" } }));
    const dup = JSON.parse(op.run(request("t9", "layers", "renameBatch", { scope: "comp", compId: 1, pattern: { mode: "prefix", text: "a_" } }))) as mirror.TaskResult;
    expect(dup.ok).toBe(false);
    expect(dup.errors[0].code).toBe("TASK_DUPLICATE_ID");
    await pump(ticks);

    // deselect everything for the empty-selection case (t8 renamed nothing here)
    const env2 = makeEnv();
    env2.mock.comps[0]._layers.forEach((l) => {
      l.selected = false;
    });
    const emptySelection = JSON.parse(
      env2.op.run(
        request("t10", "layers", "renameBatch", { scope: "selection", pattern: { mode: "prefix", text: "a_" } })
      )
    ) as mirror.TaskResult;
    expect(emptySelection.ok).toBe(false);
    expect(emptySelection.errors[0].message).toMatch(/Nothing is selected/);
    const badRegex = JSON.parse(
      env2.op.run(
        request("t11", "layers", "renameBatch", { scope: "selection", pattern: { mode: "replace", find: "(", regex: true } })
      )
    ) as mirror.TaskResult;
    expect(badRegex.ok).toBe(false);
    expect(badRegex.errors[0].code).toBe("TASK_ARG_INVALID");
    expect(badRegex.errors[0].message).toMatch(/Invalid regex/);
  });
});
