// T31 (1.0): the app's identity changed (appId us.ftlenterprises.doctrine-of-war, © FTL
// Enterprises), and players' saves must not move. Electron names the userData folder after
// the app (package.json productName, else name), never the appId; and main never renames
// the app or redirects userData. So the folder stays ~/Library/Application Support/Doctrine of War.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const root = path.join(__dirname, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const require = createRequire(import.meta.url);

describe("the 1.0 app identity", () => {
  it("is FTL Enterprises' version 1.0.1", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const builder = require(path.join(root, "electron-builder.cjs"));
    expect(pkg.version).toBe("1.0.1");
    expect(builder.appId).toBe("us.ftlenterprises.doctrine-of-war");
    expect(builder.copyright).toBe("© 2026 FTL Enterprises");
  });

  it("ships Electron's and Chromium's licences in the app, and the game's with dist/", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const builder = require(path.join(root, "electron-builder.cjs"));
    expect(builder.extraResources).toEqual([
      { from: "node_modules/electron/dist/LICENSE", to: "licenses/Electron-LICENSE.txt" },
      { from: "node_modules/electron/dist/LICENSES.chromium.html", to: "licenses/LICENSES.chromium.html" },
    ]);
    // dist/ (with dist/licenses/: the OFL texts and THIRD_PARTY_NOTICES.txt) goes into app.asar.
    expect(builder.files).toContain("dist/**/*");
  });

  it("keeps the app name the userData folder is named for (saves stay where they are)", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const builder = require(path.join(root, "electron-builder.cjs"));
    // The names every existing install's saves live under.
    expect(pkg.productName).toBe("Doctrine of War");
    expect(pkg.name).toBe("doctrine-of-war-ash-and-banner");
    expect(builder.productName).toBe(pkg.productName);
    // Main never renames the app or moves userData.
    const main = readFileSync(path.join(root, "electron", "main.ts"), "utf8");
    expect(main).not.toMatch(/app\.setName\(/);
    expect(main).not.toMatch(/setPath\(\s*["']userData["']/);
  });
});
