import { describe, expect, it } from "vitest";
import * as mirror from "../src/core/protocol.js";
import * as proto from "@operator/protocol";

/**
 * The ES3 mirror must stay in lockstep with @operator/protocol (docs/02 §2.3).
 * This is the drift tripwire: change one side, this fails.
 */
describe("protocol mirror parity", () => {
  it("versions, codes, events and capabilities match", () => {
    expect(mirror.PROTOCOL_VERSION).toBe(proto.PROTOCOL_VERSION);
    for (const key of Object.keys(proto.TASK_ERROR_CODES)) {
      expect(mirror.TASK_ERROR_CODES[key as keyof typeof mirror.TASK_ERROR_CODES]).toBe(
        proto.TASK_ERROR_CODES[key as keyof typeof proto.TASK_ERROR_CODES]
      );
    }
    expect(mirror.TASK_PROGRESS_EVENT).toBe(proto.TASK_PROGRESS_EVENT);
    expect(mirror.TASK_DONE_EVENT).toBe(proto.TASK_DONE_EVENT);
    expect(mirror.HOST_CHANGED_EVENT).toBe(proto.HOST_CHANGED_EVENT);
    expect(mirror.CAPABILITIES).toEqual(proto.CAPABILITIES);
  });

  it("envelope helpers produce identical JSON on identical inputs", () => {
    expect(mirror.makeAccepted("t")).toEqual(proto.makeAccepted("t"));
    expect(mirror.makeOk("t", { a: 1 })).toEqual(proto.makeOk("t", { a: 1 }));
    expect(mirror.makeOk("t", null, { undoToken: "u", durationMs: 3 })).toEqual(
      proto.makeOk("t", null, { undoToken: "u", durationMs: 3 })
    );
    expect(mirror.makeFail("t", [{ code: "X", message: "m" }])).toEqual(
      proto.makeFail("t", [{ code: "X", message: "m" }])
    );
    expect(mirror.makeFail("t", [{ code: "X", message: "m" }], { partial: true })).toEqual(
      proto.makeFail("t", [{ code: "X", message: "m" }], { partial: true })
    );
    expect(mirror.err("X", "m", { target: "layer 3", index: 2 })).toEqual(
      proto.err("X", "m", { target: "layer 3", index: 2 })
    );
    expect(mirror.isAccepted(mirror.makeAccepted("t"))).toBe(true);
    expect(mirror.isAccepted(mirror.makeOk("t"))).toBe(false);
  });
});
