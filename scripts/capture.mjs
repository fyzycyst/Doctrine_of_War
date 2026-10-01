// Look Lab screenshot capture: `npm run capture [-- <filter>]`.
// Video frames:   `npm run capture -- --sequence <pathId> [--scenario firstBreach|emberFord]
//                  [--seconds 8] [--fps 30] [--preset dusk]`
//   dumps captures/seq-<pathId>/frame_0000.png … stepped deterministically along a
//   cinematic camera path (see README for the ffmpeg command to make a clip).
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
  // T20: the wider orbit (±90° from the default azimuth of -8°).
  { name: "rotate-left", query: "preset=dusk&figures=a&az=-95" },
  { name: "rotate-right", query: "preset=dusk&figures=a&az=79" },
  { name: "rotate-hfd-right", query: "scenario=holdForDawn&preset=sunrise&figures=a&az=79" },
  // T20: depth of field holds the selected company (ember_runners, on the far ridge).
  { name: "dof-select-on", query: "preset=dusk&figures=a&select=ember_runners&dof=on" },
  { name: "dof-select-subtle", query: "preset=dusk&figures=a&select=ember_runners&dof=subtle" },
  { name: "dof-select-off", query: "preset=dusk&figures=a&select=ember_runners&dof=off" },
  { name: "dof-default", query: "preset=dusk&figures=a" },
  { name: "dusk-underside", query: "preset=dusk&figures=a&polar=64&az=-22" },
  { name: "stress-dusk", query: "preset=dusk&figures=a&board=stress" },
  { name: "stress-dusk-low", query: "preset=dusk&figures=a&board=stress&quality=low" },
  { name: "stress-dusk-dpr1", query: "preset=dusk&figures=a&board=stress&dpr=1" },
  { name: "stress-nightFires", query: "preset=nightFires&figures=a&board=stress" },
  { name: "emberFord-nightFires", query: "scenario=emberFord&preset=nightFires&figures=a" },
  { name: "emberFord-nightFires-close", query: "scenario=emberFord&preset=nightFires&figures=a&cam=close" },
  { name: "weather-rain", query: "preset=dusk&figures=a&weather=rain" },
  { name: "weather-rain-close", query: "preset=dusk&figures=a&weather=rain&cam=close&focusHex=0,2" },
  { name: "weather-mist", query: "preset=dusk&figures=a&weather=mist" },
  { name: "weather-ashWind", query: "preset=dusk&figures=a&weather=ashWind" },
  { name: "fog-static", query: "preset=dusk&figures=a&fog=1" },
  { name: "fog-reveal-before", query: "preset=dusk&figures=a&fog=reveal&revealAt=999" },
  { name: "fog-reveal-mid", query: "preset=dusk&figures=a&fog=reveal&revealAt=0.3&fogFreeze=0.55" },
  { name: "fog-reveal-after", query: "preset=dusk&figures=a&fog=reveal&revealAt=0.3" },
  { name: "fog-close", query: "preset=dusk&figures=a&fog=1&cam=close&focusHex=1,2" },
  { name: "fog-low", query: "preset=dusk&figures=a&fog=1&quality=low" },
  { name: "fog-nightFires", query: "scenario=emberFord&preset=nightFires&figures=a&fog=1" },
  { name: "ghost-close", query: "preset=dusk&figures=a&fog=reveal&revealAt=999&cam=close&focusHex=0,2" },
  ...[0.2, 0.45, 0.7, 1.1].map((at) => ({
    name: `reveal-close-${String(Math.round(at * 100)).padStart(3, "0")}`,
    query: `preset=dusk&figures=a&fog=reveal&revealAt=0.3&fogFreeze=${at}&cam=close&focusHex=0,2`,
  })),
  { name: "emberFord-dusk", query: "scenario=emberFord&preset=dusk&figures=a" },
  { name: "saltmarsh-rain", query: "scenario=saltmarsh&preset=rainGrey&figures=a&weather=rain" },
  { name: "saltmarsh-column-close", query: "scenario=saltmarsh&preset=rainGrey&figures=a&weather=rain&cam=close&focusHex=3,2" },
  { name: "saltmarsh-exit", query: "scenario=saltmarsh&preset=rainGrey&figures=a&weather=rain&exit=1" },
  { name: "saltmarsh-exit-close", query: "scenario=saltmarsh&preset=rainGrey&figures=a&weather=rain&exit=1&cam=close&focusHex=3,6" },
  { name: "saltmarsh-reeds-close", query: "scenario=saltmarsh&preset=rainGrey&figures=a&weather=rain&cam=close&focusHex=0,3" },
  { name: "holdForDawn-predawn", query: "scenario=holdForDawn&preset=predawn&figures=a&weather=ashWind" },
  { name: "holdForDawn-predawn-1280", query: "scenario=holdForDawn&preset=predawn&figures=a&weather=ashWind", width: 1280, height: 800 },
  { name: "holdForDawn-sunrise", query: "scenario=holdForDawn&preset=sunrise&figures=a&weather=ashWind" },
  { name: "holdForDawn-ram-close", query: "scenario=holdForDawn&preset=predawn&figures=a&weather=ashWind&cam=close&focusHex=1,3" },
  { name: "holdForDawn-ram-sunrise", query: "scenario=holdForDawn&preset=sunrise&figures=a&weather=ashWind&cam=close&focusHex=1,3" },
  { name: "holdForDawn-gate-close", query: "scenario=holdForDawn&preset=predawn&figures=a&weather=ashWind&cam=close&focusHex=7,3" },
  { name: "holdForDawn-fade", query: "scenario=holdForDawn&preset=predawn&figures=a&weather=ashWind&fadeTo=sunrise&fadeAt=0.8" },
  { name: "dusk-picking", query: "preset=dusk&figures=a&deploy=1&select=greyford_shields&hover=2,2" },
  anim("march", "stoneford_riders", 0.9),
  anim("lunge", "greyford_shields", 0.3),
  anim("fall", "greyford_shields", 0.55),
  anim("rout", "mercy_standard", 1.1),
  anim("rally", "dawnwatch_archers", 0.4),
  anim("brace", "greyford_shields", 0.6),
  anim("shake", "greyford_shields", 0.42),
  { name: "dusk-kaykit", query: "preset=dusk&figures=b" },
  { name: "dusk-toy-low", query: "preset=dusk&figures=a&quality=low" },
  { name: "chronicle-stub-toy", query: "preset=dusk&figures=a&skin=illuminatedChronicle" },
];

jobs.push(
  // Showcase (T13).
  { name: "title", query: "view=title&seq=1", sequence: { frames: 2, fps: 0.1 } },
  { name: "campaign-a", query: "view=campaign&campaignMock=a" },
  { name: "campaign-b", query: "view=campaign&campaignMock=b" },
  { name: "campaign-focus", query: "view=campaign&campaignMock=a&focus=battle_1" },
  { name: "path-craneInGate", query: "preset=dusk&figures=a&path=craneInGate&seq=1", sequence: { frames: 3, fps: 0.35 } },
  // The dawn turn as the stage plays it (2 s cross-fade), wide.
  {
    name: "holdForDawn-dawnturn",
    query: "scenario=holdForDawn&preset=predawn&figures=a&weather=ashWind&fadeTo=sunrise&fadeAt=0.3&fadeDur=2&still=1&seq=1",
    sequence: { frames: 12, fps: 4, start: 0.2 },
  },
  // The Cinderram's hides burning away at the sunrise switch (fadeAt), as a deterministic strip.
  {
    name: "holdForDawn-burn",
    query: "scenario=holdForDawn&preset=predawn&figures=a&weather=ashWind&cam=close&focusHex=1,3&fadeTo=sunrise&fadeAt=0.3&fadeDur=2&still=1&seq=1",
    sequence: { frames: 5, fps: 1 / 0.3, start: 0.1 },
  },
  { name: "path-riverPush", query: "scenario=emberFord&preset=nightFires&figures=a&path=riverPush&seq=1", sequence: { frames: 3, fps: 0.4 } },
);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const sequencePath = arg("sequence");
let selected;
if (sequencePath) {
  const seconds = Number(arg("seconds", "8"));
  const fps = Number(arg("fps", "30"));
  const scenario = arg("scenario", sequencePath === "riverPush" ? "emberFord" : "firstBreach");
  const preset = arg("preset", scenario === "emberFord" ? "nightFires" : "dusk");
  selected = [
    {
      name: `seq-${sequencePath}`,
      query: `scenario=${scenario}&preset=${preset}&figures=a&path=${sequencePath}&seq=1&capture=1`,
      sequence: { frames: Math.round(seconds * fps), fps },
    },
  ];
} else {
  const filter = process.argv[2];
  selected = filter ? jobs.filter((j) => j.name.includes(filter)) : jobs;
}
const filter = sequencePath ?? process.argv[2];
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
