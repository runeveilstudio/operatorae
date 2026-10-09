import { describe, expect, it } from "vitest";
import { createMockAeEnv, MockFile } from "@operator/ae-mock";
import { handlerTable } from "../src/index.js";
import { createOperator, type OperatorEnv } from "../src/core/operator.js";
import * as mirror from "../src/core/protocol.js";

/** system.eval — the scripting console primitive (docs/03 §13). Results
 * round-trip the JSON bridge; unserializable host objects degrade to a
 * display string; side effects wrap in one undo group. */

function makeEnv() {
  const mock = createMockAeEnv({
    fileURI: "file:///console/proj.aep",
    comps: [{ name: "MAIN", active: true, layers: [{ name: "hero", selected: true }] }]
  });
  const env: OperatorEnv = {
    app: mock.app,
    platform: "Mac OS X (mock)",
    eventsAvailable: true,
    emit: (_type, _json) => {},
    scheduleTick: (_id, _fn) => {},
    now: () => Date.now(),
    makeFile: (p) => new MockFile(p)
  };
  const op = createOperator(env, handlerTable());
  return { op, mock, env };
}

const request = (id: string, args?: unknown) =>
  JSON.stringify({ id, module: "system", fn: "eval", args: args ?? null, meta: null });

function runEval(id: string, code: string): mirror.TaskResult & { data: Record<string, unknown> } {
  const { op } = makeEnv();
  return JSON.parse(op.run(request(id, { code }))) as mirror.TaskResult & {
    data: Record<string, unknown>;
  };
}

describe("system.eval", () => {
  it("returns primitives, objects and AE DOM reads", () => {
    expect(runEval("c1", "1 + 1").data).toEqual({ display: "2", result: 2 });
    expect(runEval("c2", '"hello " + "world"').data).toEqual({ display: "hello world", result: "hello world" });
    expect(runEval("c3", "app.project.numItems").data).toEqual({ display: "1", result: 1 });
    expect(runEval("c4", "({ a: 1, b: [2, 3] })").data).toEqual({
      display: "[object Object]",
      result: { a: 1, b: [2, 3] }
    });
  });

  it("reports undefined and null results without failing", () => {
    expect(runEval("c5", "undefined").data).toEqual({ display: "undefined", result: null });
    expect(runEval("c6", "null").data).toEqual({ display: "null", result: null });
    const voidExpr = runEval("c7", "void 0");
    expect(voidExpr.data.display).toBe("undefined");
  });

  it("fails with a typed envelope on script errors and empty code", () => {
    const boom = runEval("c8", "nonsense_variable.property");
    expect(boom.ok).toBe(false);
    expect(boom.errors[0].code).toBe(mirror.TASK_ERROR_CODES.HOST_ERROR);
    expect(boom.errors[0].message).toMatch(/Console error/);

    const empty = runEval("c9", "");
    expect(empty.ok).toBe(false);
    expect(empty.errors[0].code).toBe(mirror.TASK_ERROR_CODES.ARG_INVALID);

    const noCode = JSON.parse(
      makeEnv().op.run(request("c10", { not: "code" }))
    ) as mirror.TaskResult;
    expect(noCode.ok).toBe(false);
    expect(noCode.errors[0].message).toMatch(/code/);
  });

  it("wraps console side effects in one undo group with an undo token", () => {
    const { op, mock } = makeEnv();
    const result = JSON.parse(
      op.run(request("c11", { code: 'app.project.activeItem.name = "RENAMED"' }))
    ) as mirror.TaskResult;
    expect(result.ok).toBe(true);
    expect(result.undoToken).toBe("undo:c11");
    expect(mock.undoLog).toEqual(["begin:OPERATOR: system.eval", "end"]);
    expect(mock.comps[0].name).toBe("RENAMED");
  });
});
