// `npm run audio:demo` (T20): renders the war drums and the generative score
// offline (src/audio/demo.ts, through the Look Lab's view=audioDemo) in a hidden
// Electron window and writes WAVs plus a levels report to captures/audio/.
import { spawn } from "node:child_process";
import path from "node:path";
import electronPath from "electron";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: "warn" });
await server.listen();
// `-- --set video [--out <dir>]`: the product video's music stems (src/audio/demo.ts renderVideoStems).
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const set = arg("set") === "video" ? "video" : "demos";
const url = `${server.resolvedUrls.local[0]}?lab=1&view=audioDemo&ui=0&set=${set}`;
const outDir = path.resolve(arg("out") ?? (set === "video" ? "captures/audio-video" : "captures/audio"));
const child = spawn(electronPath, [path.resolve("scripts/audio-demo-electron.mjs")], {
  stdio: "inherit",
  env: { ...process.env, AUDIO_DEMO_CONFIG: JSON.stringify({ url, outDir }) },
});
const code = await new Promise((resolve) => child.on("exit", resolve));
await server.close();
process.exit(code ?? 0);
