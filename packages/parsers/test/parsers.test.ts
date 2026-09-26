import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects, parseSrt } from "../src/index.js";

describe("parsers (shared panel+sidecar, docs/03 §9)", () => {
  it("parses CSV with quotes, embedded commas and CRLF", () => {
    const csv = 'name,value\r\n"a, b","say ""hi"""\r\nplain,7\n';
    const res = parseCsv(csv);
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([
      ["name", "value"],
      ["a, b", 'say "hi"'],
      ["plain", "7"]
    ]);
  });

  it("parses CSV into objects with header mapping and strict row width", () => {
    const ok = parseCsvObjects("title,color\nHello,#fff\nBye,#000\n");
    expect(ok.ok).toBe(true);
    expect(ok.objects).toEqual([
      { title: "Hello", color: "#fff" },
      { title: "Bye", color: "#000" }
    ]);
    const bad = parseCsvObjects("a,b\n1,2,3\n");
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/expected 2/);
  });

  it("flags unterminated quotes", () => {
    const res = parseCsv('a,b\n"broken,2\n');
    expect(res.ok).toBe(false);
  });

  it("parses SRT strictly and collects actionable errors", () => {
    const srt = [
      "1",
      "00:00:01,000 --> 00:00:02,500",
      "Hello operator",
      "",
      "2",
      "00:00:03,000 --> 00:00:02,000",
      "backwards time",
      "",
      "3",
      "00:00:04.100 --> 00:00:05.900",
      "Second line",
      "of the cue"
    ].join("\n");
    const res = parseSrt(srt);
    expect(res.ok).toBe(false);
    expect(res.cues.length).toBe(2);
    expect(res.cues[1].startMs).toBe(4100);
    expect(res.cues[1].text).toBe("Second line\nof the cue");
    expect(res.errors[0]).toMatch(/end time must be after start/);
  });
});
