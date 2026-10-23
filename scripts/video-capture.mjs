// Product-video footage (T34): `npm run video [-- <id filter>] [--out <dir>] [--keep-frames]`.
// Starts the dev server (the dev-only capture hooks need it) and renders each matching shot
// in scripts/video-shots.mjs as a deterministic 1920x1080, 30 fps H.264 clip, frame-stepped on
// a virtual clock (scripts/video-virtual-time.cjs), into ~/DoctrineOfWar-video/footage by default,
// updating footage/manifest.json as clips land.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import electronPath from "electron";
import { createServer } from "vite";
import { pathToFileURL } from "node:url";

// VIDEO_SHOTS=<file> renders another shot list (trials); the default is the video's.
const { SHOTS } = await import(process.env.VIDEO_SHOTS ? pathToFileURL(path.resolve(process.env.VIDEO_SHOTS)).href : "./video-shots.mjs");

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const filter = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--out"));
const selected = filter ? SHOTS.filter((s) => s.id.includes(filter)) : SHOTS;
if (selected.length === 0) {
  console.error(`No shots match "${filter}". Shots: ${SHOTS.map((s) => s.id).join(", ")}`);
  process.exit(1);
}
const outDir = path.resolve(arg("out") ?? path.join(os.homedir(), "DoctrineOfWar-video", "footage"));

const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: "warn" });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`vite dev server at ${url}; ${selected.length} shot(s) -> ${outDir}`);
const child = spawn(electronPath, [path.resolve("scripts/video-electron.mjs")], {
  stdio: "inherit",
  env: { ...process.env, VIDEO_CONFIG: JSON.stringify({ url, shots: selected, outDir, keepFrames: process.argv.includes("--keep-frames"), trace: process.argv.includes("--trace") }) },
});
const code = await new Promise((resolve) => child.on("exit", resolve));
await server.close();
process.exit(code ?? 0);
