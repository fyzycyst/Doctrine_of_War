// The version the game shows is the one it ships as.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_VERSION, COPYRIGHT, FONT_LICENCES } from "./about";

describe("about", () => {
  it("ships each font's licence text where the credits say it is", () => {
    for (const file of FONT_LICENCES) {
      const text = readFileSync(path.join(__dirname, "..", "..", "public", file), "utf8");
      expect(text).toContain("SIL Open Font License, Version 1.1");
      expect(text).toMatch(/Copyright \d{4} The (Cinzel|Alegreya Sans) Project Authors/);
    }
  });

  it("shows package.json's version and the maker's copyright", () => {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
    expect(APP_VERSION).toBe(pkg.version);
    expect(COPYRIGHT).toBe("© 2026 FTL Enterprises");
  });
});
