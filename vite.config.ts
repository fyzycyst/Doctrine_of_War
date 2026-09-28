import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import electron from "vite-plugin-electron/simple";
import { PRODUCTION_CSP } from "./electron/security";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enableElectron = process.env.ELECTRON === "1";

/** Production builds (web and Electron) get a restrictive CSP; the dev server needs inline scripts. */
function contentSecurityPolicy(): Plugin {
  return {
    name: "doctrine-of-war:csp",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: PRODUCTION_CSP }, injectTo: "head-prepend" },
    ],
  };
}

export default defineConfig({
  plugins: [
    react(),
    contentSecurityPolicy(),
    ...(enableElectron
      ? [
          electron({
            main: {
              entry: "electron/main.ts",
            },
            preload: {
              input: path.join(__dirname, "electron/preload.ts"),
            },
            renderer: {},
          }),
        ]
      : []),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
