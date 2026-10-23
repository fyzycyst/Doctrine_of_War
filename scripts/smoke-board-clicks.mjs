// Real-click smoke test for board musters and reliefs (T33): `npm run smoke:board-clicks`.
//
// Serves the app (vite dev, for the URL boot in src/app/boot.ts) and runs
// scripts/smoke-board-clicks-electron.mjs, which clicks the board with real mouse input in
// First Breach's second command window: a muster hex for the Stoneford Riders, and the worn
// company the Mercy Standard may relieve. Each in the tutorial (steps 8 and 9) and outside
// it. Exits non-zero if a click plans nothing. Screenshots go to captures/app/t33-*.png.
import { spawn } from "node:child_process";
import path from "node:path";
import electronPath from "electron";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: "warn" });
await server.listen();
const url = server.resolvedUrls.local[0];
const child = spawn(electronPath, [path.resolve("scripts/smoke-board-clicks-electron.mjs")], {
  stdio: "inherit",
  env: { ...process.env, SMOKE_URL: url, SMOKE_ONLY: process.argv[2] ?? "" },
});
const code = await new Promise((resolve) => child.on("exit", resolve));
await server.close();
process.exit(code ?? 1);
