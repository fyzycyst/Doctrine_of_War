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
  // T19b: below 1280 wide Settings keeps one column.
  {
    name: "settings-narrow",
    query: "screen=title",
    settleMs: 1200,
    sizes: [[1100, 760]],
    eval: `[...document.querySelectorAll(".title-menu button")].find((b) => b.textContent === "Settings")?.click()`,
  },
  // M1 (P6), on the stand-in Roll and preview packs until the engine lands.
  { name: "m1-choose-campaign", query: "screen=campaigns&mockRoll=1", settleMs: 2500 },
  { name: "m1-call-banners", query: "screen=roll&mockRoll=1&callHelp=seen", settleMs: 1500 },
  { name: "m1-call-banners-veterans", query: "screen=roll&mockRoll=veterans&callHelp=seen", settleMs: 1500 },
  { name: "m1-roll-outcome", query: "mockRoll=1&rollBattle=1&stage=outcome&plan=intended", settleMs: 2500 },
  { name: "m1-choose-stale", query: "screen=campaigns&mockRoll=stale", settleMs: 2500, sizes: [[1600, 1000]] },
  {
    name: "m1-carry-over",
    query: "screen=campaigns&mockRoll=carry",
    settleMs: 1500,
    eval: `[...document.querySelectorAll(".choice-card button")].find((b) => /Cinder Road/.test(b.getAttribute("aria-label") ?? ""))?.click()`,
  },
  { name: "m1-skirmish", query: "screen=skirmish", settleMs: 2500 },
  { name: "m1-skirmish-outcome", query: "skirmish=skirmish_ash_and_banner_battle_1&seed=7&stage=outcome&plan=intended", settleMs: 2500 },
  {
    name: "t25-skirmish-hover",
    query: "screen=skirmish",
    settleMs: 3500,
    // Hovering a card lights its island (keyboard focus does too: menuDock.test.tsx). The
    // harness shoots right after eval, so the snippet waits for the camera to ease in.
    eval: `(async () => {
      const card = document.querySelector('[aria-label="Fight: The Saltmarsh, Northbound"]')?.closest("li");
      card?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 2500));
    })()`,
  },
  { name: "t25-call-help", query: "screen=roll&mockRoll=1&callHelp=open", settleMs: 1800 },
  { name: "t25-call-help-veterans", query: "screen=roll&mockRoll=veterans&callHelp=open", settleMs: 1800, sizes: [[1280, 800]] },
  { name: "t25-skirmish-cinder-outcome", query: "skirmish=skirmish_cinder_road_cr_saltmarsh&seed=7&stage=outcome&plan=intended", settleMs: 2500 },
  { name: "campaign-start", query: "screen=campaign", settleMs: 2500 },
  { name: "campaign", query: "screen=campaign&campaignAt=1", settleMs: 2500 },
  { name: "ending-sofar", query: "screen=ending&campaignAt=2", settleMs: 2500 },
  { name: "ending", query: "screen=ending&campaignAt=2&complete=1", settleMs: 2500 },
  // T15 guidance: the intro card, each coach mark, and How to play.
  { name: "guide-intro", query: "stage=briefing&guide=reset", sizes: [[1600, 1000]] },
  { name: "guide-1-select", query: "stage=command&guide=reset", sizes: [[1600, 1000]] },
  { name: "guide-2-read", query: "stage=command&guide=reset&select=greyford_shields", sizes: [[1600, 1000]] },
  { name: "guide-3-assign", query: "stage=command&coach=assign&select=stoneford_riders", sizes: [[1600, 1000]] },
  { name: "guide-3-assign-other", query: "stage=command&coach=assign&select=greyford_shields", sizes: [[1600, 1000]] },
  { name: "guide-4-seal", query: "stage=command&coach=seal&select=greyford_shields", sizes: [[1600, 1000]] },
  { name: "guide-5-watch", query: "stage=resolving&coach=watch&plan=intended", probe: "__playbackFrozen", settleMs: 700, sizes: [[1600, 1000]] },
  { name: "guide-6-chronicle", query: "stage=report&coach=chronicle&plan=intended", sizes: [[1600, 1000]] },
  { name: "howto", query: "screen=title&howto=1", settleMs: 1500, sizes: [[1600, 1000]] },
  // T19 #2: the doctrine editor from the title, Test in the field run on a picked battle (real worker).
  {
    name: "t19-editor-field-test",
    query: "screen=title",
    settleMs: 4000,
    sizes: [[1600, 1000]],
    eval: `(async () => {
      const click = (re, root = document) => [...root.querySelectorAll("button")].find((b) => re.test(b.textContent) || re.test(b.getAttribute("aria-label") ?? ""))?.click();
      click(/Doctrine editor/);
      await new Promise((r) => setTimeout(r, 400));
      const editor = document.querySelector("dialog.editor");
      click(/^Move order 2 up$/, editor);
      await new Promise((r) => setTimeout(r, 200));
      click(/^Run the test$/, editor);
      await new Promise((r) => setTimeout(r, 2500));
      editor.querySelector(".field-test")?.scrollIntoView({ block: "end" });
    })()`,
  },  {
    name: "t22-field-test-repeat",
    query: "screen=title",
    settleMs: 4000,
    sizes: [[1600, 1000], [1280, 800]],
    eval: `(async () => {
      const click = (re, root = document) => [...root.querySelectorAll("button")].find((b) => re.test(b.textContent) || re.test(b.getAttribute("aria-label") ?? ""))?.click();
      click(/Doctrine editor/);
      await new Promise((r) => setTimeout(r, 400));
      const editor = document.querySelector("dialog.editor");
      click(/^Move order 2 up$/, editor);
      await new Promise((r) => setTimeout(r, 200));
      click(/^Run the test$/, editor);
      await new Promise((r) => setTimeout(r, 2500));
      click(/^Run again$/, editor);
      await new Promise((r) => setTimeout(r, 300));
      editor.querySelector(".field-test")?.scrollIntoView({ block: "end" });
    })()`,
  },
  // T18 QA: every battle mid-playback, the new battles' command windows, dawn, maps, ending.
  ...[
    ["qa-fb-play", "scenario=firstBreach&stage=resolving&plan=intended&pauseAt=rule-mine"],
    ["qa-ef-play", "scenario=emberFord&stage=resolving&plan=intended&pauseAt=rule-mine"],
    ["qa-sm-play", "scenario=saltmarshColumn&stage=resolving&plan=intended&pauseAt=rule-mine"],
    ["qa-hfd-play", "scenario=holdForDawn&stage=resolving&plan=intended&pauseAt=rule-mine"],
    // T19: a busy moment of the largest battle (declutter, anchored camera, emphasis ring).
    ["t19-hfd-busy", "scenario=holdForDawn&stage=resolving&phase=1&plan=intended&pauseAt=busy"],
    // T19: a weather shift as a chyron in the top bar (Ember Ford turns to rain in phase 3).
    ["t19-weather-chyron", "scenario=holdForDawn&stage=resolving&phase=3&plan=intended&pauseAt=weather"],
    // T22: the weather ticker mid-crossing, and held still under reduced motion.
    ["t22-weather-ticker", "scenario=holdForDawn&stage=resolving&phase=3&plan=intended&pauseAt=weather&motion=full"],
    ["t22-weather-ticker-reduced", "scenario=holdForDawn&stage=resolving&phase=3&plan=intended&pauseAt=weather&motion=reduce"],
    // M1: Cinder Road battle 1, fielded from Call the Banners (the recommended force), mid-playback.
    ["m1-roll-play", "mockRoll=1&rollBattle=1&stage=resolving&plan=intended&pauseAt=rule-mine"],
    ["qa-sm-play2", "scenario=saltmarshColumn&stage=resolving&phase=2&plan=intended&pauseAt=rule-mine"],
    ["qa-hfd-dawn", "scenario=holdForDawn&stage=resolving&phase=4&plan=intended&speed=25&pauseAt=stage"],
    ["qa-capture-play", "scenario=emberFord&stage=resolving&plan=intended&pauseAt=rule-mine&capture=1"],
    ["qa-reduced-play", "scenario=firstBreach&stage=resolving&plan=intended&pauseAt=rule-mine&motion=reduce"],
  ].map(([name, query]) => ({
    name,
    query,
    probe: "__playbackFrozen",
    settleMs: name === "qa-hfd-dawn" ? 4000 : name === "t22-weather-ticker" ? 2600 : name === "t22-weather-ticker-reduced" ? 1500 : 700,
  })),
  // T23b: fog of war in the real game at each hour (Fortune on), 1600 only.
  ...[
    ["fow-dusk", "scenario=firstBreach&stage=command"],
    ["fow-night", "scenario=emberFord&stage=command"],
    ["fow-predawn", "scenario=holdForDawn&stage=command"],
    ["fow-sunrise", "scenario=holdForDawn&stage=command&phase=5&plan=intended"],
  ].map(([name, query]) => ({ name, query, sizes: [[1600, 1000]] })),
  { name: "qa-sm-command", query: "scenario=saltmarshColumn&stage=command&select=saltmarsh_column" },
  { name: "qa-sm-deploy", query: "scenario=saltmarshColumn&stage=deploy&select=greyford_shields" },
  { name: "qa-hfd-command", query: "scenario=holdForDawn&stage=command&select=greyford_shields" },
  { name: "qa-hfd-command5", query: "scenario=holdForDawn&stage=command&phase=5&plan=intended&select=greyford_shields" },
  { name: "qa-hfd-report4", query: "scenario=holdForDawn&stage=report&phase=4&plan=intended" },
  { name: "qa-sm-report", query: "scenario=saltmarshColumn&stage=report&plan=intended" },
  { name: "qa-sm-stalemate", query: "scenario=saltmarshColumn&seed=1&stage=outcome&plan=intended" },
  { name: "qa-hfd-outcome", query: "scenario=holdForDawn&stage=outcome&plan=intended" },
  { name: "qa-hfd-briefing", query: "scenario=holdForDawn&stage=briefing" },
  { name: "qa-sm-briefing", query: "scenario=saltmarshColumn&stage=briefing" },
  ...[1, 2, 3, 4].map((n) => ({ name: `qa-map-${n}`, query: `screen=campaign&campaignAt=${n}`, settleMs: 2500 })),
  { name: "qa-ending", query: "screen=ending&campaignAt=4", settleMs: 2500 },
  { name: "briefing", query: "stage=briefing" },
  { name: "deploy", query: "stage=deploy&select=greyford_shields" },
  { name: "command", query: "stage=command&select=greyford_shields" },
  { name: "command-enemy", query: "stage=command&select=cinder_vanguard" },
  // T21: muster on Hold for Dawn's phase 2: the tint for a free company, a planned move, a relief.
  {
    name: "t21-muster-tint",
    query: "scenario=holdForDawn&stage=command&phase=2&plan=intended",
    sizes: [[1600, 1000]],
    eval: `(async () => {
      const wait = () => new Promise((r) => setTimeout(r, 120));
      for (const tab of document.querySelectorAll('.roster [role="option"].own')) {
        tab.click();
        await wait();
        if (document.querySelector(".muster-choices button:not(.relieve)")) break;
      }
      
    })()`,
  },
  {
    name: "t21-muster-arrow",
    query: "scenario=holdForDawn&stage=command&phase=2&plan=intended",
    sizes: [[1600, 1000]],
    eval: `(async () => {
      const wait = () => new Promise((r) => setTimeout(r, 120));
      for (const tab of document.querySelectorAll('.roster [role="option"].own')) {
        tab.click();
        await wait();
        if (document.querySelector(".muster-choices button:not(.relieve)")) break;
      }
      document.querySelector(".muster-choices button:not(.relieve)")?.click();
    })()`,
  },
  // T21: the muster line, once, in the first battle's second command window.
  { name: "t21-guide-muster", query: "stage=command&phase=2&plan=intended&select=stoneford_riders", sizes: [[1600, 1000]] },
  {
    name: "t21-relief",
    query: "scenario=holdForDawn&stage=command&phase=2&plan=intended&select=greyford_shields",
    sizes: [[1600, 1000]],
    eval: `[...document.querySelectorAll(".muster-choices button.relieve")].find((b) => /Gatewarden Spears/.test(b.textContent))?.click()`,
  },
  // T19: the terrain chip, Greyford Shields reading the North Ridge (better ground) and the ford (worse).
  { name: "t19-terrain-ridge", query: "stage=command&select=greyford_shields&hover=1,0", sizes: [[1600, 1000]] },
  { name: "t19-terrain-ford", query: "stage=command&select=greyford_shields&hover=0,2", sizes: [[1600, 1000]] },
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
