import { describe, expect, it } from "vitest";
import { appWebPreferences } from "./windowOptions";

describe("app window web preferences", () => {
  it("lets the score start without a gesture and changes nothing else (T24)", () => {
    const prefs = appWebPreferences("/app/dist-electron/preload.mjs");
    expect(prefs).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: "/app/dist-electron/preload.mjs",
      autoplayPolicy: "no-user-gesture-required",
    });
  });
});
