import { describe, expect, it } from "vitest";
import * as shim from "../src/core/json.js";

const values: unknown[] = [
  0,
  1,
  -2.5,
  1e21,
  true,
  false,
  null,
  "",
  "plain",
  'q"uote',
  "back\\slash",
  "tab\tnewline\nline",
  "control\x01char",
  "unicode café 中文",
  [],
  [[]],
  [1, "a", null, true],
  [undefined],
  {},
  { a: 1 },
  { b: "x", nested: { deep: [true, { k: null }, "end"] } },
  { omitted: undefined, kept: 2 }
];

describe("ES3 JSON shim vs native JSON", () => {
  it("stringifies identically to JSON.stringify for wire shapes", () => {
    for (const v of values) {
      expect(shim.stringify(v)).toBe(JSON.stringify(v));
    }
  });

  it("parses everything native JSON parses, identically", () => {
    for (const v of values) {
      const native = JSON.stringify(v);
      expect(shim.parse(native)).toEqual(JSON.parse(native));
    }
  });

  it("round-trips through itself", () => {
    for (const v of values) {
      expect(shim.parse(shim.stringify(v))).toEqual(JSON.parse(JSON.stringify(v)));
    }
  });

  it("rejects malformed input strictly", () => {
    const bad = ["", "{", "[1,", '{"a"', '{"a":}', "nul", "tru", "12x", "{} trailing", "[1] x", '"unclosed'];
    for (const b of bad) {
      expect(() => shim.parse(b)).toThrow();
    }
  });

  it("handles JSON escapes exactly like native parse", () => {
    const tricky = '{"s":"a\\"b\\\\c\\nd\\te\\u00e9\\u4e2d","n":-0.5e2}';
    expect(shim.parse(tricky)).toEqual(JSON.parse(tricky));
  });
});
