import { describe, expect, it } from "vitest";
import { createMockAeEnv } from "@operator/ae-mock";
import type { AeItem } from "@operator/ae-types";
import { handlerTable } from "../src/index.js";
import { createOperator, type OperatorEnv } from "../src/core/operator.js";
import * as mirror from "../src/core/protocol.js";

/**
 * Asset Doctor v1 (docs/03 §1): missing media, unused footage and broken
 * expressions in one read-only, chunked sweep. The fixture nests MAIN inside
 * a folder so the id-deduped walk is exercised against the mock (which also
 * leaks nested items through project.item(i), unlike real AE).
 */

interface Emitted {
  type: string;
  json: string;
}

function makeEnv() {
  const mock = createMockAeEnv({
    fileURI: "file:///Users/artist/Projects/night%20cut.aep",
    folders: ["Precomps"],
    comps: [
      {
        name: "MAIN",
        active: true,
        parentFolder: "Precomps",
        layers: [
          { name: "bg" },
          {
            name: "fx rig",
            props: [
              { matchName: "ADBE Scale", expression: "wiggle(", expressionError: "SyntaxError: missing )" }
            ]
          },
          {
            name: "title text",
            layerType: "text",
            props: [
              {
                matchName: "ADBE Text Properties",
                children: [
                  {
                    name: "More Options",
                    matchName: "ADBE Text More Options",
                    children: [
                      {
                        name: "Expression",
                        matchName: "ADBE Text Expressible",
                        expression: "bad[",
                        expressionError: "bad is not defined"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        name: "SUB",
        layers: [
          {
            name: "nested",
            props: [{ matchName: "ADBE Opacity", expression: "100" }],
            effects: [
              {
                name: "Glow",
                matchName: "ADBE Glo",
                children: [
                  {
                    name: "Glow Radius",
                    matchName: "ADBE Glo-0002",
                    expression: "loopOut(",
                    expressionError: "Unexpected token"
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    footage: [
      { name: "used_hero.mov", path: "C:/media/used_hero.mov" },
      { name: "orphan.mov", path: "C:/media/orphan.mov" },
      { name: "missing_render.mov", missing: true },
      { name: "Black Solid", solid: true }
    ]
  });
  const byName = (n: string): AeItem | null => mock.items.find((i) => i.name === n) ?? null;
  mock.comps[0]._layers[0].source = byName("used_hero.mov");
  const emitted: Emitted[] = [];
  const ticks: Array<{ id: string; fn: () => void }> = [];
  const env: OperatorEnv = {
    app: mock.app,
    platform: "Mac OS X (mock)",
    eventsAvailable: true,
    emit: (type, json) => emitted.push({ type, json }),
    scheduleTick: (id, fn) => ticks.push({ id, fn }),
    now: () => Date.now()
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

const request = (id: string, module: string, fn: string, args?: unknown, meta?: unknown) =>
  JSON.stringify({ id, module, fn, args: args ?? null, meta: meta ?? null });

async function scan(chunkSize: number) {
  const { op, mock, emitted, ticks } = makeEnv();
  const ack = JSON.parse(
    op.run(request("d1", "assets", "doctorScan", null, { chunkSize }))
  ) as mirror.TaskAccepted;
  expect(ack.accepted).toBe(true);
  await pump(ticks);
  const done = emitted.find((e) => e.type === mirror.TASK_DONE_EVENT)!;
  const result = JSON.parse(done.json) as mirror.TaskResult;
  return { result, mock, emitted };
}

describe("assets.doctorScan", () => {
  it("audits missing media, unused footage and broken expressions in one read-only sweep", async () => {
    const { result, mock, emitted } = await scan(2);

    expect(result.ok).toBe(true);
    expect(result.undoToken).toBe(null); // read-only: nothing to undo
    expect(mock.undoLog).toEqual([]); // no undo group ever opened

    const data = result.data as {
      projectPath: string;
      scanned: { items: number; comps: number; layers: number; expressions: number };
      counts: { missing: number; unused: number; brokenExpressions: number };
      missing: Array<{ itemId: number; name: string; path: string; folder: string; reason: string }>;
      unused: Array<{ name: string; kind: string; folder: string }>;
      brokenExpressions: Array<{ comp: string; layer: string; path: string; matchName: string; expression: string; error: string }>;
    };

    expect(data.projectPath).toBe("/Users/artist/Projects/night cut.aep");

    // Deduped walk: 1 folder + 2 comps + 4 footage = 7 unique items,
    // MAIN seen once even though the mock also exposes it at the root.
    expect(data.scanned).toEqual({ items: 7, comps: 2, layers: 4, expressions: 4 });
    expect(data.counts).toEqual({ missing: 1, unused: 3, brokenExpressions: 3 });

    expect(data.missing).toEqual([
      {
        itemId: 6,
        name: "missing_render.mov",
        path: "/mock/missing_render.mov",
        folder: "",
        reason: "File missing on disk"
      }
    ]);

    expect(data.unused.map((u) => u.name)).toEqual(["orphan.mov", "missing_render.mov", "Black Solid"]);
    expect(data.unused[2].kind).toBe("Solid");

    expect(data.brokenExpressions).toEqual([
      expect.objectContaining({
        comp: "MAIN",
        layer: "fx rig",
        path: "Transform > Scale",
        matchName: "ADBE Scale",
        expression: "wiggle(",
        error: "SyntaxError: missing )",
        enabled: true
      }),
      expect.objectContaining({
        comp: "MAIN",
        layer: "title text",
        path: "Text > More Options > Expression",
        error: "bad is not defined"
      }),
      expect.objectContaining({
        comp: "SUB",
        layer: "nested",
        path: "Effects > Glow > Glow Radius",
        matchName: "ADBE Glo-0002",
        error: "Unexpected token"
      })
    ]);

    // 11 work units at chunkSize 2 -> 6 slices, one progress event per slice.
    const progress = emitted.filter((e) => e.type === mirror.TASK_PROGRESS_EVENT);
    expect(progress.length).toBe(6);
  });

  it("reports a clean project when every asset is used and every expression evaluates", async () => {
    const mock = createMockAeEnv({
      fileURI: "file:///clean/proj.aep",
      comps: [
        {
          name: "ONLY",
          layers: [
            { name: "hero", props: [{ matchName: "ADBE Opacity", expression: "100" }] }
          ]
        }
      ],
      footage: [{ name: "hero.mov" }]
    });
    mock.comps[0]._layers[0].source = mock.items.find((i) => i.name === "hero.mov") ?? null;
    const emitted: Emitted[] = [];
    const ticks: Array<{ id: string; fn: () => void }> = [];
    const env: OperatorEnv = {
      app: mock.app,
      platform: "Mac OS X (mock)",
      eventsAvailable: true,
      emit: (type, json) => emitted.push({ type, json }),
      scheduleTick: (id, fn) => ticks.push({ id, fn }),
      now: () => Date.now()
    };
    const op = createOperator(env, handlerTable());
    const ack = JSON.parse(op.run(request("d2", "assets", "doctorScan"))) as mirror.TaskAccepted;
    expect(ack.accepted).toBe(true);
    await pump(ticks);
    const result = JSON.parse(
      emitted.find((e) => e.type === mirror.TASK_DONE_EVENT)!.json
    ) as mirror.TaskResult & { data: Record<string, unknown> };

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      counts: { missing: 0, unused: 0, brokenExpressions: 0 },
      scanned: { items: 2, comps: 1, layers: 1, expressions: 1 },
      missing: [],
      unused: [],
      brokenExpressions: []
    });
  });
});
