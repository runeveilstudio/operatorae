import { describe, expect, it } from "vitest";
import { TASK_ERROR_CODES, isAccepted, makeAccepted, makeFail, makeOk } from "../src/index.js";

describe("task protocol envelopes", () => {
  it("accepted envelopes are distinguishable from results", () => {
    const ack = makeAccepted("t-1");
    expect(isAccepted(ack)).toBe(true);
    expect(isAccepted(makeOk("t-1", { any: 1 }))).toBe(false);
    expect(JSON.parse(JSON.stringify(ack))).toEqual({ accepted: true, taskId: "t-1" });
  });

  it("ok results serialize deterministically (same keys, same order)", () => {
    const a = makeOk("t-2", { renamed: 3 }, { undoToken: "undo-t-2", durationMs: 12 });
    const b = makeOk("t-2", { renamed: 3 }, { undoToken: "undo-t-2", durationMs: 12 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.ok).toBe(true);
    expect(a.data).toEqual({ renamed: 3 });
  });

  it("failure envelopes carry typed errors with target context", () => {
    const r = makeFail("t-3", [
      { code: TASK_ERROR_CODES.CAPABILITY_MISSING, message: "No undo groups", target: "comp 12" }
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors?.[0].code).toBe("TASK_CAPABILITY_MISSING");
    expect(r.errors?.[0].target).toBe("comp 12");
  });
});
