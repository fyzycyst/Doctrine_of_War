// Command UI screenshot capture: `npm run capture:app [-- <filter>]`.
// Loads the real app (not the Look Lab) at a given stage via the dev-only URL boot
// (src/app/boot.ts) at 1600x1000 and 1280x800, and saves PNGs to captures/app/.
import { spawn } from "node:child_process";
import path from "node:path";
import electronPath from "electron";
import { createServer } from "vite";

const SIZES = [
  [1600, 1000],
  [1280, 800],
];
const STAGES = [
  { name: "title", query: "screen=title", settleMs: 2500 },
  {
    name: "settings",
    query: "screen=title",
    settleMs: 1200,
    eval: `[...document.querySelectorAll(".title-menu button")].find((b) => b.textContent === "Settings")?.click()`,
  },
  { name: "campaign-start", query: "screen=campaign", settleMs: 2500 },
  { name: "campaign", query: "screen=campaign&campaignAt=1", settleMs: 2500 },
  { name: "ending-sofar", query: "screen=ending&campaignAt=2", settleMs: 2500 },
  { name: "ending", query: "screen=ending&campaignAt=2&complete=1", settleMs: 2500 },
  { name: "briefing", query: "stage=briefing" },
  { name: "deploy", query: "stage=deploy&select=greyford_shields" },
  { name: "command", query: "stage=command&select=greyford_shields" },
  { name: "command-enemy", query: "stage=command&select=cinder_vanguard" },
  {
    name: "command-lift",
    query: "stage=command&select=mercy_standard",
    eval: `document.querySelectorAll('.hand [role="option"]')[1]?.focus()`,
    keys: ["Right"],
  },
  { name: "report", query: "stage=report&plan=intended" },
  { name: "outcome", query: "stage=outcome&plan=intended" },
  { name: "ember-command", query: "scenario=emberFord&stage=command&select=kestrel_lancers" },
  // T06 playback stills, frozen on the first callout of a kind (dev ?pauseAt=).
  ...[
    ["play-rule", "stage=resolving&plan=intended&pauseAt=rule-mine"],
    ["play-surge", "stage=resolving&plan=intended&pauseAt=surge"],
    ["play-rout", "stage=resolving&phase=2&plan=bad&pauseAt=rout"],
    ["play-gate", "stage=resolving&phase=2&plan=bad&pauseAt=gate"],
    ["play-dread", "scenario=emberFord&stage=resolving&plan=intended&pauseAt=dread"],
  ].map(([name, query]) => ({ name, query, probe: "__playbackFrozen", sizes: [[1600, 1000]], settleMs: 600 })),
];
const jobs = STAGES.flatMap((stage) =>
  (stage.sizes ?? SIZES).map(([width, height]) => ({
    name: `${stage.name}-${width}`,
    query: `${stage.query}&still=1`,
    eval: stage.eval,
    keys: stage.keys,
    probe: stage.probe ?? "__battleBoard",
    settleMs: stage.settleMs,
    width,
    height,
  })),
);

const filter = process.argv[2];
const selected = filter ? jobs.filter((j) => j.name.includes(filter)) : jobs;
if (selected.length === 0) {
  console.error(`No capture jobs match "${filter}". Jobs: ${jobs.map((j) => j.name).join(", ")}`);
  process.exit(1);
}

const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: "warn" });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`vite dev server at ${url}`);

const outDir = path.resolve("captures/app");
const child = spawn(electronPath, [path.resolve("scripts/capture-electron.mjs")], {
  stdio: "inherit",
  env: { ...process.env, CAPTURE_CONFIG: JSON.stringify({ url, jobs: selected, outDir }) },
});
const code = await new Promise((resolve) => child.on("exit", resolve));
await server.close();
process.exit(code ?? 0);
