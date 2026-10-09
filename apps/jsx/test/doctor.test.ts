import { describe, expect, it } from "vitest";
import { createMockAeEnv, MockFile } from "@operator/ae-mock";
import type { AeItem } from "@operator/ae-types";
import { handlerTable } from "../src/index.js";
import { createOperator, type OperatorEnv } from "../src/core/operator.js";
import * as mirror from "../src/core/protocol.js";

/**
 * Asset Doctor (docs/03 §1): scan v1.1 covers missing media, unused footage,
 * duplicate sources and broken expressions; fix-commands relink footage and
 * remove unused items with dry-run previews. The fixture nests MAIN inside a
 * folder so the id-deduped walk is exercised against the mock (which also
 * leaks nested items through project.item(i), unlike real AE), and the
 * duplicate pair differs only in path case to prove normalization.
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
              { name: "Scale", matchName: "ADBE Scale", expression: "wiggle(", expressionError: "SyntaxError: missing )" }
            ]
          },
          {
            name: "title text",
            layerType: "text",
            props: [
              {
                name: "Text",
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
            props: [{ name: "Opacity", matchName: "ADBE Opacity", expression: "100" }],
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
      // Same file, different case: the duplicate group must normalize.
      { name: "used_hero_copy.mov", path: "c:/MEDIA/USED_HERO.MOV" },
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
    now: () => Date.now(),
    makeFile: (p) => new MockFile(p, p.indexOf("ghost") === -1)
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

/** Run a task to completion; returns the done envelope plus the mock env. */
async function runTask(id: string, fn: string, args?: unknown, meta?: unknown) {
  const { op, mock, emitted, ticks } = makeEnv();
  const first = JSON.parse(op.run(request(id, "assets", fn, args, meta)));
  if ((first as mirror.TaskAccepted).accepted === true) {
    await pump(ticks);
    const done = emitted.find((e) => e.type === mirror.TASK_DONE_EVENT)!;
    return {
      mock,
      emitted,
      result: JSON.parse(done.json) as mirror.TaskResult & { data: Record<string, unknown> }
    };
  }
  return { mock, emitted, result: first as mirror.TaskResult & { data: Record<string, unknown> } };
}

describe("assets.doctorScan", () => {
  it("audits missing media, unused footage, duplicates and broken expressions in one read-only sweep", async () => {
    const { result, mock, emitted } = await runTask("d1", "doctorScan", null, { chunkSize: 2 });

    expect(result.ok).toBe(true);
    expect(result.undoToken).toBe(null); // read-only: nothing to undo
    expect(mock.undoLog).toEqual([]); // no undo group ever opened

    const data = result.data as {
      projectPath: string;
      scanned: { items: number; comps: number; layers: number; expressions: number };
      counts: { missing: number; unused: number; duplicates: number; brokenExpressions: number };
      missing: Array<{ itemId: number; name: string; path: string; folder: string; reason: string }>;
      unused: Array<{ name: string; kind: string; folder: string }>;
      duplicates: Array<{ path: string; count: number; items: Array<{ itemId: number; name: string }> }>;
      brokenExpressions: Array<{ comp: string; layer: string; path: string; matchName: string; expression: string; error: string }>;
    };

    expect(data.projectPath).toBe("/Users/artist/Projects/night cut.aep");

    // Deduped walk: 1 folder + 2 comps + 5 footage = 8 unique items,
    // MAIN seen once even though the mock also exposes it at the root.
    expect(data.scanned).toEqual({ items: 8, comps: 2, layers: 4, expressions: 4 });
    expect(data.counts).toEqual({ missing: 1, unused: 4, duplicates: 1, brokenExpressions: 3 });

    expect(data.missing).toEqual([
      {
        itemId: 7,
        name: "missing_render.mov",
        path: "/mock/missing_render.mov",
        folder: "",
        reason: "File missing on disk"
      }
    ]);

    expect(data.unused.map((u) => u.name)).toEqual([
      "used_hero_copy.mov",
      "orphan.mov",
      "missing_render.mov",
      "Black Solid"
    ]);
    expect(data.unused[3].kind).toBe("Solid");

    expect(data.duplicates).toEqual([
      {
        path: "C:/media/used_hero.mov",
        count: 2,
        items: [
          { itemId: 4, name: "used_hero.mov", folder: "" },
          { itemId: 5, name: "used_hero_copy.mov", folder: "" }
        ]
      }
    ]);

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

    // 12 work units at chunkSize 2 -> 6 slices, one progress event per slice.
    const progress = emitted.filter((e) => e.type === mirror.TASK_PROGRESS_EVENT);
    expect(progress.length).toBe(6);
  });

  it("reports a clean project when every asset is used and every expression evaluates", async () => {
    const mock = createMockAeEnv({
      fileURI: "file:///clean/proj.aep",
      comps: [
        {
          name: "ONLY",
          layers: [{ name: "hero", props: [{ name: "Opacity", matchName: "ADBE Opacity", expression: "100" }] }]
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
      now: () => Date.now(),
      makeFile: (p) => new MockFile(p)
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
      counts: { missing: 0, unused: 0, duplicates: 0, brokenExpressions: 0 },
      scanned: { items: 2, comps: 1, layers: 1, expressions: 1 },
      missing: [],
      unused: [],
      duplicates: [],
      brokenExpressions: []
    });
  });
});

describe("assets.relinkMissing", () => {
  const MISSING_ID = 7; // missing_render.mov in the shared fixture

  it("previews in dry-run without touching the item or opening undo", async () => {
    const { result, mock } = await runTask(
      "r1",
      "relinkMissing",
      { entries: [{ itemId: MISSING_ID, path: "C:/renders/found_render.mov" }] },
      { dryRun: true }
    );
    expect(result.ok).toBe(true);
    expect(result.data.relinked).toBe(0);
    expect(result.data.preview).toEqual([
      {
        itemId: MISSING_ID,
        name: "missing_render.mov",
        from: "/mock/missing_render.mov",
        to: "C:/renders/found_render.mov"
      }
    ]);
    const footage = mock.project.itemByID(MISSING_ID) as { file: { fsName: string; exists: boolean } };
    expect(footage.file.fsName).toBe("/mock/missing_render.mov");
    expect(footage.file.exists).toBe(false);
    expect(mock.undoLog).toEqual([]);
  });

  it("relinks for real inside one undo group", async () => {
    const { result, mock } = await runTask("r2", "relinkMissing", {
      entries: [{ itemId: MISSING_ID, path: "C:/renders/found_render.mov" }]
    });
    expect(result.ok).toBe(true);
    expect(result.data.relinked).toBe(1);
    expect(result.undoToken).toBe("undo:r2");
    expect(mock.undoLog).toEqual(["begin:OPERATOR: assets.relinkMissing", "end"]);
    const footage = mock.project.itemByID(MISSING_ID) as { file: { fsName: string; exists: boolean } };
    expect(footage.file.fsName).toBe("C:/renders/found_render.mov");
    expect(footage.file.exists).toBe(true);
  });

  it("skips non-existent targets and non-footage items, rejects bad args", async () => {
    const ghost = await runTask("r3", "relinkMissing", {
      entries: [
        { itemId: MISSING_ID, path: "C:/ghost_render.mov" },
        { itemId: 2, path: "C:/renders/whatever.mov" } // MAIN comp, not footage
      ]
    });
    expect(ghost.result.ok).toBe(true);
    expect(ghost.result.data.relinked).toBe(0);
    expect(ghost.result.data.skipped).toEqual([
      { target: "missing_render.mov", reason: "Target file does not exist: C:/ghost_render.mov" },
      { target: "MAIN", reason: "Item is not footage" }
    ]);
    expect(ghost.mock.undoLog).toEqual(["begin:OPERATOR: assets.relinkMissing", "end"]); // mutating batch opens the group

    const unknownId = await runTask("r4", "relinkMissing", {
      entries: [{ itemId: 999, path: "C:/x.mov" }]
    });
    expect(unknownId.result.ok).toBe(false);
    expect(unknownId.result.errors[0].code).toBe(mirror.TASK_ERROR_CODES.ARG_INVALID);

    const emptyEntries = await runTask("r5", "relinkMissing", { entries: [] });
    expect(emptyEntries.result.ok).toBe(false);
    expect(emptyEntries.result.errors[0].message).toMatch(/empty/);

    const badShape = await runTask("r6", "relinkMissing", { entries: "nope" });
    expect(badShape.result.ok).toBe(false);
    expect(badShape.result.errors[0].code).toBe(mirror.TASK_ERROR_CODES.ARG_INVALID);
  });
});

describe("assets.removeUnused", () => {
  it("previews removal in dry-run without deleting or opening undo", async () => {
    const { result, mock } = await runTask("m1", "removeUnused", null, { dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.data.removed).toBe(0);
    expect((result.data.preview as Array<{ name: string }>).map((p) => p.name)).toEqual([
      "used_hero_copy.mov",
      "orphan.mov",
      "missing_render.mov",
      "Black Solid"
    ]);
    expect(mock.project.numItems).toBe(8);
    expect(mock.undoLog).toEqual([]);
  });

  it("removes exactly the unused items inside one undo group; used footage survives", async () => {
    const { result, mock } = await runTask("m2", "removeUnused", null, { chunkSize: 2 });
    expect(result.ok).toBe(true);
    expect(result.data.removed).toBe(4);
    expect(result.undoToken).toBe("undo:m2");
    expect(mock.undoLog).toEqual(["begin:OPERATOR: assets.removeUnused", "end"]);
    expect(mock.project.numItems).toBe(4);
    const names: string[] = [];
    for (let i = 1; i <= mock.project.numItems; i++) names.push(mock.project.item(i).name);
    expect(names).toEqual(["Precomps", "MAIN", "SUB", "used_hero.mov"]);
    const survivor = mock.project.itemByID(4) as { name: string; file: { exists: boolean } };
    expect(survivor.name).toBe("used_hero.mov");
    expect(survivor.file.exists).toBe(true);
  });
});
