import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import electron from "vite-plugin-electron/simple";
import { PRODUCTION_CSP } from "./electron/security";
import { BALANCE_TEST_GLOBS, CAMPAIGN_TEST_GLOBS } from "./src/test/suites";

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
  build: {
    rollupOptions: {
      output: {
        // Vendor split: stable libraries get their own long-cached chunks and
        // download in parallel with the app code (all same-origin, so the CSP's
        // script-src 'self' is unchanged).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Split only along acyclic lines: three (+ three-stdlib) import nothing from
          // React, and pmndrs postprocessing imports only three. Everything React-based
          // (react, react-dom, R3F, drei, zustand…) stays together; splitting it
          // creates circular chunks that break React's module init order.
          if (/node_modules\/(three|three-stdlib)\//.test(id)) return "vendor-three";
          if (/node_modules\/postprocessing\//.test(id)) return "vendor-postfx";
          return "vendor-react";
        },
      },
    },
    // three.js alone is ~700 kB minified and cannot be split further; the rest is well under.
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // Three suites (src/test/suites.ts): `npm test` runs "unit", `npm run test:balance` runs
    // "balance" (the simulation-heavy files), `npm run test:campaign` runs "campaign" (the
    // heaviest campaign sweeps); a bare `vitest run` runs all three.
    projects: [
      { extends: true, test: { name: "unit", exclude: [...configDefaults.exclude, ...BALANCE_TEST_GLOBS, ...CAMPAIGN_TEST_GLOBS] } },
      // Heavy simulations: a generous per-test limit, so a busy machine (other agents' gates)
      // slows them rather than failing them. Keep each test well under it at normal load.
      {
        extends: true,
        test: { name: "balance", include: BALANCE_TEST_GLOBS, exclude: [...configDefaults.exclude, ...CAMPAIGN_TEST_GLOBS], setupFiles: ["./src/test/setup.balance.ts"], testTimeout: 240_000 },
      },
      // The heaviest campaign sweeps (the finale's, and the pursuit's role census): the same
      // rules, their own run (src/test/suites.ts).
      {
        extends: true,
        test: { name: "campaign", include: CAMPAIGN_TEST_GLOBS, setupFiles: ["./src/test/setup.balance.ts"], testTimeout: 240_000 },
      },
    ],
  },
});
