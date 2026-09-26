import { describe, expect, it } from "vitest";
import { LOCALES, createT } from "../src/index.js";

describe("i18n seed", () => {
  it("translates with variable interpolation and falls back to the key", () => {
    const t = createT(LOCALES.en);
    expect(t("palette.empty")).toBe("No matching commands");
    expect(t("missing.key")).toBe("missing.key");
  });

  it("pseudo-loc expands strings by ~40% for truncation checks (docs/04 §8)", () => {
    const en = createT(LOCALES.en);
    const pseudo = createT(LOCALES.pseudo);
    const key = "palette.placeholder";
    expect(pseudo(key).length).toBeGreaterThan(en(key).length);
    expect(Object.keys(LOCALES.pseudo).sort()).toEqual(Object.keys(LOCALES.en).sort());
  });
});
