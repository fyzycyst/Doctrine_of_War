// T31: the README's controls table is the shortcut table (src/app/shortcuts.ts), row for row,
// and it states the version the game ships as.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_VERSION, RELEASES_URL, WEB_URL } from "./about";
import { comboLabel, SHORTCUTS } from "./shortcuts";

const readme = readFileSync(path.join(__dirname, "..", "..", "README.md"), "utf8");

describe("the README", () => {
  it("lists every shortcut exactly as the game does", () => {
    for (const shortcut of SHORTCUTS) {
      const keys = shortcut.combos.map((combo) => `\`${comboLabel(combo)}\``).join(" or ");
      expect(readme).toContain(`| ${keys} | ${shortcut.does} | ${shortcut.where} |`);
    }
  });

  it("states the version and links to the web build and the releases", () => {
    expect(readme).toContain(`Version ${APP_VERSION}`);
    expect(readme).toContain(WEB_URL);
    expect(readme).toContain(RELEASES_URL);
  });
});
