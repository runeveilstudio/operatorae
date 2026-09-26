import { describe, expect, it } from "vitest";
import * as pk from "../src/index.js";

describe("pathkit (docs/04 §3 path rules)", () => {
  it("normalizes separators and redundant slashes on both flavors", () => {
    expect(pk.normalize("C:\\a\\\\b\\\\c")).toBe("C:/a/b/c");
    expect(pk.normalize("/Users/x//y/")).toBe("/Users/x/y");
    expect(pk.normalize("\\\\server\\share\\x")).toBe("//server/share/x");
  });

  it("detects platform flavor without sniffing the host", () => {
    expect(pk.detectPlatform("C:/x")).toBe("windows");
    expect(pk.detectPlatform("\\\\srv\\s")).toBe("windows");
    expect(pk.detectPlatform("/Users/x")).toBe("posix");
    expect(pk.detectPlatform("relative/x")).toBe("posix");
  });

  it("splits canonical roots: drives, UNC, posix, rootless", () => {
    expect(pk.toCanonical("C:\\Projects\\cut.aep").root).toBe("C:");
    expect(pk.toCanonical("\\\\NAS\\motion\\cut.aep").root).toBe("\\\\NAS\\motion");
    expect(pk.toCanonical("/Users/x/proj.aep").root).toBe("/");
    expect(pk.toCanonical("relink/out").rootless).toBe(true);
  });

  it("compares case-insensitively by default, matching Windows/APFS reality", () => {
    expect(pk.samePath("C:/A/B.aep", "c:\\a\\b.AEP")).toBe(true);
    expect(pk.samePath("/a/b", "/A/B", true)).toBe(false);
  });

  it("handles basename, dirname, extension and joins", () => {
    expect(pk.basename("C:\\x\\hero shot.aep")).toBe("hero shot.aep");
    expect(pk.dirname("/a/b/c.mov")).toBe("/a/b");
    expect(pk.extension("clip.v2.MOV")).toBe(".MOV");
    expect(pk.join("C:/a", "b", "", "c/")).toBe("C:/a/b/c");
  });

  it("renders native separators per flavor", () => {
    expect(pk.toNative("C:/a/b.jsx")).toBe("C:\\a\\b.jsx");
    expect(pk.toNative("/a/b.jsx")).toBe("/a/b.jsx");
  });

  it("builds >260-char-safe Windows extended paths (docs/04 §3 rule 6)", () => {
    expect(pk.toWindowsExtended("C:/deep/nest/long name.jsx")).toBe(
      "\\\\?\\C:\\deep\\nest\\long name.jsx"
    );
    expect(pk.toWindowsExtended("//NAS/motion/cut.aep")).toBe("\\\\?\\UNC\\NAS\\motion\\cut.aep");
    expect(pk.toWindowsExtended("/posix/path")).toBe("/posix/path");
  });
});
