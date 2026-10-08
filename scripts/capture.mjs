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
  // T21 muster: where the selected company can march (gold = the old deployment tint, for comparison).
  ...[
    ["fb", "preset=dusk&figures=a&select=greyford_shields", "3,2"],
    ["ef", "scenario=emberFord&preset=nightFires&figures=a&select=tollbridge_pikes", "6,1"],
  ].flatMap(([id, q, at]) => [
    { name: `march-${id}-gold`, query: `${q}&march=gold` },
    { name: `march-${id}`, query: `${q}&march=1` },
    { name: `march-${id}-close`, query: `${q}&march=1&cam=close&focusHex=${at}` },
  ]),
  // T23: mist readability per preset (each with the mist weather), and fog of war at dusk.
  ...["dusk", "nightFires", "rainGrey", "predawn", "sunrise"].map((preset) => ({ name: `t23-${preset}`, query: `preset=${preset}&figures=a` })),
  ...["dusk", "predawn"].map((preset) => ({ name: `t23-${preset}-mist`, query: `preset=${preset}&figures=a&weather=mist` })),
  { name: "t23-hfd-sunrise", query: "scenario=holdForDawn&preset=sunrise&figures=a&weather=ashWind" },
  { name: "t23-hfd-sunrise-clear", query: "scenario=holdForDawn&preset=sunrise&figures=a" },
  { name: "t23-fog", query: "preset=dusk&figures=a&fog=reveal&revealAt=999" },
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
  { name: "saltmarsh-column-close", query: "scenario=saltmarsh&preset=rainGrey&figures=a&weather=rain&cam=close&focusHex=4,4" },
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
  // M1: the map for 4, 6, 8 and 11 battles, plus a zoom on the 11-battle map.
  ...[4, 6, 8, 11].map((n) => ({ name: `campaign-n${n}`, query: `view=campaign&campaignMock=n${n}` })),
  { name: "campaign-n11-focus", query: "view=campaign&campaignMock=n11&focus=battle_7" },
  { name: "campaign-select", query: "view=campaignSelect" },
  { name: "campaign-select-highlight", query: "view=campaignSelect&highlight=cinder-road" },
  // T25 §3: framing for a panel docked on the left, the visible highlight, and reduced motion.
  ...[
    [1600, 1000],
    [1280, 800],
  ].flatMap(([width, height]) => [
    { name: `t25-campaign-right-${width}`, query: "view=campaignSelect&framing=right&panel=1&highlight=cinder-road", width, height },
    { name: `t25-skirmish-right-${width}`, query: "view=campaignSelect&skirmish=1&framing=right&panel=1&highlight=ember-ford", width, height },
  ]),
  { name: "t25-skirmish-right-nohighlight", query: "view=campaignSelect&skirmish=1&framing=right&panel=1" },
  { name: "t25-campaign-reduced", query: "view=campaignSelect&framing=right&panel=1&highlight=cinder-road&motion=reduce" },
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

// M2: objectives on open ground. Cinder Road 1's barricade, and the two-objective lab
// board (the Host's wagons at 6,2, the Banners' sluice at 2,2), each intact, battered,
// broken, hit, at night, and broken under reduced motion.
{
  const props = [
    { id: "barricade", base: "scenario=cinderRoad1&preset=dusk&figures=a", at: "3,1" },
    { id: "wagons", base: "scenario=twoObjectives&preset=dusk&figures=a", at: "6,2" },
    { id: "sluice", base: "scenario=twoObjectives&preset=dusk&figures=a", at: "2,2" },
  ];
  jobs.push(
    { name: "m2-barricade-wide", query: props[0].base },
    { name: "m2-barricade-broken-wide", query: `${props[0].base}&objective=broken` },
    { name: "m2-two-wide", query: props[1].base },
    { name: "m2-two-broken-wide", query: `${props[1].base}&objective=broken` },
    ...props.flatMap(({ id, base, at }) => {
      const close = `${base}&cam=close&focusHex=${at}&objectiveAt=${at}`;
      return [
        { name: `m2-${id}-intact`, query: close },
        { name: `m2-${id}-battered`, query: `${close}&objective=battered` },
        { name: `m2-${id}-broken`, query: `${close}&objective=broken` },
        { name: `m2-${id}-hit`, query: `${close}&anim=shake&shakeAt=${at}&animFreeze=0.3` },
        { name: `m2-${id}-night`, query: `${close.replace("preset=dusk", "preset=nightFires")}` },
        { name: `m2-${id}-broken-reduced`, query: `${close}&objective=broken&motion=reduce` },
      ];
    }),
  );
}

// M2 follow-ups: Ember Ford by day (cold charred stumps, a thin smoke, no braziers) and by
// night (unchanged: the bridges burn).
jobs.push(
  { name: "m2f-emberFord-day", query: "scenario=emberFord&preset=dusk&figures=a" },
  { name: "m2f-emberFord-day-close", query: "scenario=emberFord&preset=dusk&figures=a&cam=close&focusHex=4,4" },
  { name: "m2f-emberFord-night", query: "scenario=emberFord&preset=nightFires&figures=a" },
  // Roads to the Host's objective on the two-objective board, and C2 (Strike the Wagon
  // Park): wide with both objectives, and the Sluice Walk beat as the ram arrives.
  { name: "m2f-two-roads", query: "scenario=twoObjectives&preset=dusk&figures=a" },
  { name: "m2f-c2-wide", query: "scenario=cinderRoad2&preset=dusk&figures=a" },
  { name: "m2f-c2-wide-rain", query: "scenario=cinderRoad2&preset=rainGrey&figures=a&weather=rain" },
  { name: "m2f-c2-sluice-walk", query: "scenario=cinderRoad2&preset=dusk&figures=a&closeOn=6,1;7,0" },
  { name: "m2f-c2-sluice-walk-battered", query: "scenario=cinderRoad2&preset=dusk&figures=a&closeOn=6,1;7,0&objective=battered&objectiveAt=7,0" },
  { name: "m2f-c2-wagons", query: "scenario=cinderRoad2&preset=dusk&figures=a&cam=close&focusHex=1,6" },
);

// Cinder Road's finale (battle 5, cinderRoad6.ts): Greyford Gate held by the Host, attacked from the west. The gate
// intact, battered, breached, hit and breached under reduced motion, from the approach;
// and First Breach's (the Banners') gate for comparison, intact and battered.
{
  // Day under ash-wind, as the scenario plays.
  const cr6 = "scenario=cinderRoad6&preset=dusk&figures=a&weather=ashWind";
  // The finale beat from the attackers' side (south-west), so the gate's west face shows.
  const beat = `${cr6}&closeOn=7,3;8,3&az=-55`;
  jobs.push(
    { name: "cr6-wide", query: cr6 },
    { name: "cr6-wide-clear", query: cr6.replace("&weather=ashWind", "") },
    { name: "cr6-river", query: `${cr6}&cam=close&focusHex=0,2` },
    { name: "cr6-gate-intact", query: beat },
    { name: "cr6-gate-battered", query: `${beat}&objective=battered` },
    { name: "cr6-gate-breached", query: `${beat}&objective=broken` },
    { name: "cr6-gate-hit", query: `${beat}&objective=battered&anim=shake&shakeAt=8,3&animFreeze=0.3` },
    { name: "cr6-gate-breached-reduced", query: `${beat}&objective=broken&motion=reduce` },
    { name: "cr6-gate-night", query: `${beat.replace("preset=dusk", "preset=nightFires")}` },
    // Battle 4, the pursuit, on the same board: the gate a dressed wall (Host banner, intact).
    { name: "cr4-pursuit-wide", query: "scenario=cinderRoad5&preset=dusk&figures=a" },
    { name: "cr4-pursuit-gate", query: "scenario=cinderRoad5&preset=dusk&figures=a&closeOn=7,3;8,3&az=-55" },
    { name: "cr6-fb-gate", query: "scenario=firstBreach&preset=dusk&figures=a&cam=close&focusHex=4,2" },
    { name: "cr6-fb-gate-battered", query: "scenario=firstBreach&preset=dusk&figures=a&cam=close&focusHex=4,2&objective=battered" },
  );
}

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
