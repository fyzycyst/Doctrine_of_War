import type { WebPreferences } from "electron";

/**
 * The app window's web preferences. The security settings (isolation, no Node,
 * sandbox, web security) are fixed; T24 adds only `autoplayPolicy` so the
 * score can start on the title screen without a click. Tested in
 * windowOptions.test.ts.
 */
export function appWebPreferences(preload: string): WebPreferences {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    preload,
    autoplayPolicy: "no-user-gesture-required",
  };
}
