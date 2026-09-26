import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

describe("quirk table", () => {
  it("is well-formed data (docs/06 §5: quirk knowledge lives in the repo)", async () => {
    const path = fileURLToPath(new URL("../data/quirks.json", import.meta.url));
    const table = JSON.parse(await readFile(path, "utf8")) as {
      version: number;
      quirks: { id: string; hosts: Record<string, string>; summary: string }[];
    };
    expect(table.version).toBeGreaterThan(0);
    expect(table.quirks.length).toBeGreaterThanOrEqual(5);
    for (const q of table.quirks) {
      expect(q.id).toMatch(/^[a-z0-9.-]+$/);
      expect(Object.keys(q.hosts).length).toBeGreaterThan(0);
      expect(q.summary.length).toBeGreaterThan(10);
    }
  });
});
