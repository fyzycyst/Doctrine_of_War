// Look Lab screenshot capture: `npm run capture [-- <filter>]`.
// Starts a Vite dev server, launches Electron with a hidden 1600x1000 window,
// loads each `?lab=1&...` job, waits for the scene to settle and saves PNGs via
// webContents.capturePage() into captures/ (gitignored). Reused later for marketing shots.
import { spawn } from "node:child_process";
import path from "node:path";
import electronPath from "electron";
import { createServer } from "vite";

const PRESETS = ["dusk", "nightFires", "rainGrey", "predawn", "sunrise"];
const anim = (name, squad, freeze) => ({
  name: `anim-${name}`,
  query: `preset=dusk&figures=a&cam=close&anim=${name}&animSquad=${squad}&animFreeze=${freeze}`,
});
const jobs = [
  ...PRESETS.map((preset) => ({ name: `${preset}-toy`, query: `preset=${preset}&figures=a` })),
  { name: "dusk-toy-close", query: "preset=dusk&figures=a&cam=close" },
  { name: "dusk-underside", query: "preset=dusk&figures=a&polar=64&az=-22" },
  { name: "stress-dusk", query: "preset=dusk&figures=a&board=stress" },
  { name: "stress-dusk-low", query: "preset=dusk&figures=a&board=stress&quality=low" },
  { name: "stress-dusk-dpr1", query: "preset=dusk&figures=a&board=stress&dpr=1" },
  { name: "stress-nightFires", query: "preset=nightFires&figures=a&board=stress" },
  { name: "emberFord-nightFires", query: "scenario=emberFord&preset=nightFires&figures=a" },
  { name: "emberFord-dusk", query: "scenario=emberFord&preset=dusk&figures=a" },
  { name: "dusk-picking", query: "preset=dusk&figures=a&deploy=1&select=greyford_shields&hover=2,2" },
  anim("march", "stoneford_riders", 0.9),
  anim("lunge", "greyford_shields", 0.3),
  anim("fall", "greyford_shields", 0.55),
  anim("rout", "mercy_standard", 1.1),
  anim("rally", "dawnwatch_archers", 0.4),
  anim("brace", "greyford_shields", 0.6),
  { name: "dusk-kaykit", query: "preset=dusk&figures=b" },
  { name: "dusk-toy-low", query: "preset=dusk&figures=a&quality=low" },
  { name: "dusk-toy-fog", query: "preset=dusk&figures=a&fog=1" },
  { name: "chronicle-stub-toy", query: "preset=dusk&figures=a&skin=illuminatedChronicle" },
];

const filter = process.argv[2];
const selected = filter ? jobs.filter((j) => j.name.includes(filter)) : jobs;
if (selected.length === 0) {
  console.error(`No capture jobs match "${filter}". Jobs: ${jobs.map((j) => j.name).join(", ")}`);
  process.exit(1);
}

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: "warn" });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`vite dev server at ${url}`);

const outDir = path.resolve("captures");
const child = spawn(electronPath, [path.resolve("scripts/capture-electron.mjs")], {
  stdio: "inherit",
  env: { ...process.env, CAPTURE_CONFIG: JSON.stringify({ url, jobs: selected, outDir }) },
});
const code = await new Promise((resolve) => child.on("exit", resolve));
await server.close();
process.exit(code ?? 0);
