import { describe, expect, it } from "vitest";
import { fuzzyScore } from "../src/index.js";

describe("fuzzyScore (palette ranking seed)", () => {
  it("scores zero for non-matches and empty input", () => {
    expect(fuzzyScore("zq", "layers")).toBe(0);
    expect(fuzzyScore("", "layers")).toBe(0);
    expect(fuzzyScore("ren", "")).toBe(0);
  });

  it("ranks exact starts-with above substring above scattered subsequence", () => {
    const start = fuzzyScore("ren", "rename layers");
    const mid = fuzzyScore("ren", "batch rename layers");
    const scattered = fuzzyScore("ren", "refine number");
    expect(start).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(scattered);
    expect(scattered).toBeGreaterThan(0);
  });

  it("rewards word-boundary matches over mid-word matches", () => {
    const wordStart = fuzzyScore("ba", "batch rename");
    const midWord = fuzzyScore("ba", "sobat chrename");
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("REN", "rename")).toBe(fuzzyScore("ren", "rename"));
  });
});
