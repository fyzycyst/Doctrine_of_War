import { createReadStream, existsSync, statSync } from "node:fs";
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

/**
 * Dev-only static folder for the Look Lab's optional CC0 figures (`npm run fetch:cc0`).
 * It is outside `public/`, so production builds (web and Electron) never contain it.
 */
function labAssets(): Plugin {
  const root = path.join(__dirname, "lab-assets");
  const types: Record<string, string> = { ".glb": "model/gltf-binary", ".txt": "text/plain", ".md": "text/markdown" };
  return {
    name: "doctrine-of-war:lab-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/lab-assets", (req, res, next) => {
        const file = path.normalize(path.join(root, decodeURIComponent((req.url ?? "/").split("?")[0])));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    contentSecurityPolicy(),
    labAssets(),
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
