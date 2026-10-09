import { describe, expect, it } from "vitest";
import { createMockAeEnv, MockFile } from "@operator/ae-mock";
import type { AeItem } from "@operator/ae-types";
import { handlerTable } from "../src/index.js";
import { createOperator, type OperatorEnv } from "../src/core/operator.js";
import * as mirror from "../src/core/protocol.js";
import { hexToRgb } from "../src/modules/color.js";

/** color.applyHex — the palette hex picker (docs/03 §12 P0). Text fills via
 * Source Text, solid-backed layers via the source item (recolors every
 * layer sharing the solid, as AE itself does). */

interface Emitted {
  type: string;
  json: string;
}

function makeEnv() {
  const mock = createMockAeEnv({
    fileURI: "file:///color/proj.aep",
    comps: [
      {
        name: "SCENE",
        active: true,
        layers: [
          { name: "headline", layerType: "text", selected: true },
          { name: "solid bg", selected: true },
          { name: "camera", layerType: "camera", selected: true },
          { name: "plain av" }
        ]
      }
    ],
    footage: [{ name: "BG_SOLID", solid: true, solidColor: [0.1, 0.2, 0.3] }]
  });
  const solid = mock.items.find((i) => i.name === "BG_SOLID") ?? null;
  mock.comps[0]._layers[1].source = solid as AeItem;
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
  return { op, mock, emitted, ticks };
}

async function pump(ticks: Array<{ fn: () => void }>): Promise<void> {
  while (ticks.length > 0) {
    const t = ticks.shift();
    t!.fn();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const request = (id: string, args?: unknown, meta?: unknown) =>
  JSON.stringify({ id, module: "color", fn: "applyHex", args: args ?? null, meta: meta ?? null });

async function applyHex(id: string, args?: unknown, meta?: unknown) {
  const env = makeEnv();
  const first = JSON.parse(env.op.run(request(id, args, meta)));
  if ((first as mirror.TaskAccepted).accepted === true) {
    await pump(env.ticks);
    const done = JSON.parse(
      env.emitted.find((e) => e.type === mirror.TASK_DONE_EVENT)!.json
    ) as mirror.TaskResult & { data: Record<string, unknown> };
    return { result: done, mock: env.mock };
  }
  return { result: first as mirror.TaskResult, mock: env.mock };
}

describe("hexToRgb", () => {
  it("parses 6- and 3-digit hex, rejects garbage", () => {
    expect(hexToRgb("#ff0044")).toEqual([1, 0, 68 / 255]);
    expect(hexToRgb("ff0044")).toEqual([1, 0, 68 / 255]);
    expect(hexToRgb("#f04")).toEqual([1, 0, 68 / 255]);
    expect(hexToRgb("#12345")).toBeNull();
    expect(hexToRgb("#zzzzzz")).toBeNull();
    expect(hexToRgb("")).toBeNull();
  });
});

describe("color.applyHex", () => {
  it("applies to text fills and solid sources in one undo group, skips what has no fill", async () => {
    const { result, mock } = await applyHex("h1", { hex: "#ff0044" });
    expect(result.ok).toBe(true);
    expect(result.data.applied).toBe(2);
    expect(result.undoToken).toBe("undo:h1");
    expect(mock.undoLog).toEqual(["begin:OPERATOR: color.applyHex", "end"]);
    expect(result.data.skipped).toEqual([
      { layer: "camera", reason: "Layer has no fill color to set (text fill or solid source required)" }
    ]);

    const textDoc = mock.comps[0]._layers[0].property("ADBE Text Properties").property("ADBE Text Document")
      .value as { fillColor: number[] };
    expect(textDoc.fillColor[0]).toBeCloseTo(1, 6);
    expect(textDoc.fillColor[1]).toBeCloseTo(0, 6);
    expect(textDoc.fillColor[2]).toBeCloseTo(68 / 255, 6);

    const solid = mock.items.find((i) => i.name === "BG_SOLID") as { mainSource: { color?: number[] } };
    expect(solid.mainSource.color?.[0]).toBeCloseTo(1, 6);
    expect(solid.mainSource.color?.[2]).toBeCloseTo(68 / 255, 6);
  });

  it("previews in dry-run without mutating", async () => {
    const { result, mock } = await applyHex("h2", { hex: "#00ff00" }, { dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.data.applied).toBe(0);
    expect(result.data.preview).toEqual([
      { layer: "headline", target: "text fill" },
      { layer: "solid bg", target: 'solid source "BG_SOLID"' }
    ]);
    const textDoc = mock.comps[0]._layers[0].property("ADBE Text Properties").property("ADBE Text Document")
      .value as { fillColor: number[] };
    expect(textDoc.fillColor).toEqual([1, 1, 1]);
    const solid = mock.items.find((i) => i.name === "BG_SOLID") as { mainSource: { color?: number[] } };
    expect(solid.mainSource.color).toEqual([0.1, 0.2, 0.3]);
    expect(mock.undoLog).toEqual([]);
  });

  it("rejects bad hex and empty selection with actionable errors", async () => {
    const badHex = await applyHex("h3", { hex: "#nope" });
    expect(badHex.result.ok).toBe(false);
    expect(badHex.result.errors[0].code).toBe(mirror.TASK_ERROR_CODES.ARG_INVALID);
    expect(badHex.result.errors[0].message).toMatch(/Invalid hex/);

    const noHex = await applyHex("h4", {});
    expect(noHex.result.ok).toBe(false);
    expect(noHex.result.errors[0].message).toMatch(/hex/);

    const env = makeEnv();
    env.mock.comps[0]._layers.forEach((l) => {
      l.selected = false;
    });
    const empty = JSON.parse(env.op.run(request("h5", { hex: "#fff" }))) as mirror.TaskResult;
    expect(empty.ok).toBe(false);
    expect(empty.errors[0].message).toMatch(/Nothing is selected/);
  });
});
