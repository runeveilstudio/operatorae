import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { makeAccepted, makeOk, type TaskRequest } from "@operator/protocol";
import { createMockAeEnv } from "@operator/ae-mock";
import { handlerTable } from "@operator/jsx";
import { createOperator } from "@operator/jsx";

/**
 * Single source of truth (docs/06 §2): the schemas must accept everything
 * the protocol actually produces, including full round-trips through the ES3
 * dispatcher core. AJV guards the panel side; the JSX side uses the
 * hand-mirrored validators.
 */
const dir = fileURLToPath(new URL("./", import.meta.url));
const ajv = new Ajv({ allErrors: true });

const requestSchema = JSON.parse(readFileSync(`${dir}task.request.schema.json`, "utf8"));
const resultSchema = JSON.parse(readFileSync(`${dir}task.result.schema.json`, "utf8"));
const progressSchema = JSON.parse(readFileSync(`${dir}task.progress.schema.json`, "utf8"));
const snapshotSchema = JSON.parse(readFileSync(`${dir}snapshot.manifest.schema.json`, "utf8"));

const validateRequest = ajv.compile(requestSchema);
const validateResult = ajv.compile(resultSchema);
const validateProgress = ajv.compile(progressSchema);
const validateSnapshot = ajv.compile(snapshotSchema);

const sampleSnapshot = {
  id: "abc-123",
  version: 1,
  createdAt: Date.now(),
  projectPath: "/proj/night.aep",
  reason: "layers.renameBatch",
  items: [{ id: 1, name: "MAIN", type: "Composition" }],
  aepCopy: null,
  operatorVersion: "0.0.1"
};

describe("wire schemas accept everything the runtime emits", () => {
  it("accepts TaskRequest and TaskResult samples", () => {
    const req: TaskRequest = {
      id: "layers.renameBatch:m1:1",
      module: "layers",
      fn: "renameBatch",
      args: { scope: "selection", pattern: { mode: "prefix", text: "shot_" } },
      meta: { dryRun: true, chunkSize: 50, snapshotId: null }
    };
    expect(validateRequest(req)).toBe(true);
    expect(validateRequest({ ...req, module: "bogus" as never })).toBe(false);

    expect(validateResult(makeOk("t", { any: 1 }, { undoToken: "undo:t", durationMs: 3 }))).toBe(true);
    expect(
      validateResult({
        taskId: "t",
        ok: false,
        data: null,
        errors: [{ code: "TASK_CANCELLED", message: "stop", target: "layer 1", index: 0 }]
      })
    ).toBe(true);
    expect(validateResult(makeAccepted("t"))).toBe(false);
  });

  it("accepts the ack envelope as a request-time sibling, not a result", () => {
    // makeAccepted is a TaskRequest-response ack, not a final result — it must
    // NOT validate against the result schema (it has no taskId/ok).
    expect(validateResult(makeAccepted("t"))).toBe(false);
  });

  it("accepts progress events and snapshot manifests", () => {
    expect(
      validateProgress({ taskId: "t", done: 25, total: 100, phase: "running", message: "Renaming 25/100" })
    ).toBe(true);
    expect(validateProgress({ taskId: "t", done: 25, total: 100, phase: "done" })).toBe(false);
    expect(validateSnapshot(sampleSnapshot)).toBe(true);
    expect(validateSnapshot({ ...sampleSnapshot, version: 2 })).toBe(false);
  });

  it("accepts REAL envelopes produced by the ES3 dispatcher over the mock AE DOM", async () => {
    const mock = createMockAeEnv({
      comps: [{ name: "MAIN", active: true, layers: [{ name: "a", selected: true }] }]
    });
    const emitted: Array<{ type: string; json: string }> = [];
    const operator = createOperator(
      {
        app: mock.app,
        platform: "schema-test",
        eventsAvailable: true,
        emit: (type, json) => emitted.push({ type, json }),
        scheduleTick: (_id, fn) => setTimeout(fn, 0),
        now: () => Date.now()
      },
      handlerTable()
    );

    const requestJson = JSON.stringify({
      id: "schema:1",
      module: "layers",
      fn: "renameBatch",
      args: { scope: "selection", pattern: { mode: "prefix", text: "x_" } },
      meta: { chunkSize: 1 }
    });
    const ackJson = operator.run(requestJson);
    expect(validateRequest(JSON.parse(requestJson))).toBe(true);

    await new Promise((r) => setTimeout(r, 10));
    for (const e of emitted) {
      const payload = JSON.parse(e.json);
      if (e.type === "com.operator.task.progress") {
        expect(validateProgress(payload)).toBe(true);
      } else {
        expect(validateResult(payload)).toBe(true);
      }
    }
    expect(typeof ackJson).toBe("string");
  });
});
