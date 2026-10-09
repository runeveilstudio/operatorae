import { describe, expect, it } from "vitest";
import { createMockAeEnv, MockFile } from "@operator/ae-mock";
import { handlerTable } from "../src/index.js";
import { createOperator, type OperatorEnv } from "../src/core/operator.js";
import * as mirror from "../src/core/protocol.js";
import { naturalCompare } from "../src/modules/layers.js";

/** Batch layer ops: sort (docs/05 Phase 1 — rename done, sort + find-replace
 * next). "alpha_2" must sort before "alpha_10" (numeric-aware), locked
 * layers move with the stack, dry-run only previews. */

interface Emitted {
  type: string;
  json: string;
}

function makeEnv() {
  const mock = createMockAeEnv({
    fileURI: "file:///sort/proj.aep",
    comps: [
      {
        name: "STACK",
        active: true,
        layers: [
          { name: "hero" },
          { name: "bg", locked: true },
          { name: "alpha_2" },
          { name: "alpha_10" },
          { name: "alpha_1" }
        ]
      },
      { name: "EMPTY", layers: [] },
      { name: "SORTED", layers: [{ name: "a_1" }, { name: "a_2" }, { name: "a_10" }] }
    ]
  });
  const emitted: Emitted[] = [];
  const ticks: Array<{ id: string; fn: () => void }> = [];
  const env: OperatorEnv = {
    app: mock.app,
    platform: "Mac OS X (mock)",
    eventsAvailable: true,
    emit: (type, json) => emitted.push({ type, json }),
    scheduleTick: (id, fn) => ticks.push({ id, fn }),
    now: () => Date.now(),
    makeFile: (p) => new MockFile(p)
  };
  const op = createOperator(env, handlerTable());
  const names = (): string[] => {
    const comp = mock.comps[0];
    const out: string[] = [];
    for (let i = 1; i <= comp.numLayers; i++) out.push(comp.layer(i).name);
    return out;
  };
  return { op, mock, emitted, ticks, names };
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

async function sort(id: string, args?: unknown, meta?: unknown) {
  const env = makeEnv();
  const ack = JSON.parse(
    env.op.run(request(id, "layers", "sortBatch", args, meta))
  ) as mirror.TaskAccepted | mirror.TaskResult;
  if ((ack as mirror.TaskAccepted).accepted === true) {
    await pump(env.ticks);
    const done = env.emitted.find((e) => e.type === mirror.TASK_DONE_EVENT)!;
    const result = JSON.parse(done.json) as mirror.TaskResult & { data: Record<string, unknown> };
    return { result, mock: env.mock, names: env.names, emitted: env.emitted };
  }
  return {
    result: ack as mirror.TaskResult,
    mock: env.mock,
    names: env.names,
    emitted: env.emitted
  };
}

describe("naturalCompare", () => {
  it("sorts numbers inside names numerically and ignores case", () => {
    const list = ["alpha_10", "Alpha_2", "bg", "alpha_1", "B_2", "b_10"];
    const sorted = list.slice().sort((a, b) => naturalCompare(a, b) || (list.indexOf(a) - list.indexOf(b)));
    expect(sorted).toEqual(["alpha_1", "Alpha_2", "alpha_10", "B_2", "b_10", "bg"]);
    expect(naturalCompare("a", "b")).toBeLessThan(0);
    expect(naturalCompare("b", "a")).toBeGreaterThan(0);
    expect(naturalCompare("same", "same")).toBe(0);
  });
});

describe("layers.sortBatch", () => {
  it("sorts by name ascending (numeric-aware) inside one undo group, locked included", async () => {
    const { result, mock, names } = await sort("s1");
    expect(result.ok).toBe(true);
    expect(result.data.order).toBe("name-asc");
    expect(result.data.moved).toBe(5);
    expect(result.undoToken).toBe("undo:s1");
    expect(mock.undoLog).toEqual(["begin:OPERATOR: layers.sortBatch", "end"]);
    expect(names()).toEqual(["alpha_1", "alpha_2", "alpha_10", "bg", "hero"]);
  });

  it("sorts name-desc and reverse", async () => {
    const desc = await sort("s2", { order: "name-desc" });
    expect(desc.result.ok).toBe(true);
    expect(desc.names()).toEqual(["hero", "bg", "alpha_10", "alpha_2", "alpha_1"]);

    const rev = await sort("s3", { order: "reverse" });
    expect(rev.result.ok).toBe(true);
    expect(rev.names()).toEqual(["alpha_1", "alpha_10", "alpha_2", "bg", "hero"]);
  });

  it("dry-run previews the from→to order without moving or opening undo", async () => {
    const { result, mock, names } = await sort("s4", { order: "name-asc" }, { dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.data.moved).toBe(0);
    expect(result.data.from).toEqual(["hero", "bg", "alpha_2", "alpha_10", "alpha_1"]);
    expect(result.data.to).toEqual(["alpha_1", "alpha_2", "alpha_10", "bg", "hero"]);
    expect(names()).toEqual(["hero", "bg", "alpha_2", "alpha_10", "alpha_1"]);
    expect(mock.undoLog).toEqual([]);
  });

  it("reports alreadySorted as a no-op when the stack matches the target order", async () => {
    const env = makeEnv();
    const ack = JSON.parse(
      env.op.run(request("s5", "layers", "sortBatch", { compId: env.mock.comps[2].id }))
    ) as mirror.TaskAccepted;
    expect(ack.accepted).toBe(true);
    await pump(env.ticks);
    const done = JSON.parse(
      env.emitted.find((e) => e.type === mirror.TASK_DONE_EVENT)!.json
    ) as mirror.TaskResult & { data: Record<string, unknown> };
    expect(done.ok).toBe(true);
    expect(done.data.alreadySorted).toBe(true);
    expect(done.data.moved).toBe(0);
  });

  it("handles single- or zero-layer comps and targets comps by id", async () => {
    const env = makeEnv();
    const empty = JSON.parse(
      env.op.run(request("s7", "layers", "sortBatch", { compId: env.mock.comps[1].id }))
    ) as mirror.TaskAccepted;
    expect(empty.accepted).toBe(true);
    await pump(env.ticks);
    const done = JSON.parse(
      env.emitted.find((e) => e.type === mirror.TASK_DONE_EVENT)!.json
    ) as mirror.TaskResult & { data: Record<string, unknown> };
    expect(done.ok).toBe(true);
    expect(done.data.alreadySorted).toBe(true);

    const badId = JSON.parse(env.op.run(request("s8", "layers", "sortBatch", { compId: 999 }))) as mirror.TaskResult;
    expect(badId.ok).toBe(false);
    expect(badId.errors[0].code).toBe(mirror.TASK_ERROR_CODES.ARG_INVALID);
  });
});
