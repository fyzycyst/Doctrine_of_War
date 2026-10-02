// Real-app smoke test for Roll saves (M1 P5/P6), on production builds.
//
//   ELECTRON=1 npx vite build && npx electron scripts/smoke-roll-save.mjs
//       The REAL Electron app (dist-electron/main.js: preload, IPC, main's allowlisted
//       userData files), with userData redirected to a temp folder.
//   npx vite build && npx vite preview --port 4179 &
//   SMOKE_URL=http://localhost:4179/ npx electron scripts/smoke-roll-save.mjs
//       The web build as served: saves in localStorage.
//
// With real clicks: begin the intro (its save is written), then Choose a campaign → Cinder
// Road → Call the Banners → battle 1 played to its outcome. Then checks that Cinder Road's
// run is in its own file/key with battle 1 recorded, that the intro's save is byte for byte
// unchanged, and that a restart (reload) reads the run back as "In progress"/"Completed".
// Screenshots go to captures/app/m1-smoke-<mode>-*.png. Exits non-zero on failure.
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow } from "electron";

const url = process.env.SMOKE_URL;
const mode = url ? "web" : "electron";
const outDir = path.resolve("captures/app");
const userData = mkdtempSync(path.join(os.tmpdir(), "dow-roll-smoke-"));
app.setPath("userData", userData);
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

const INTRO_FILE = "campaign-save.json";
const ROLL_FILE = "campaign-cinder_road.json";
const INTRO_KEY = "doctrine-of-war:campaign";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log(`[roll-smoke:${mode}]`, ...args);

async function drive(win) {
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const waitFor = async (expr, what, ms = 60_000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (await js(`Boolean(${expr})`)) return;
      await sleep(200);
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const button = (pattern, scope = "document") =>
    `[...${scope}.querySelectorAll("button")].find((b) => !b.disabled && (${pattern}.test(b.textContent.trim()) || ${pattern}.test(b.getAttribute("aria-label") ?? "")))`;
  const click = async (pattern, what, scope) => {
    await waitFor(button(pattern, scope), what);
    await js(`${button(pattern, scope)}.click()`);
    await sleep(300);
  };
  const tryClick = async (pattern, scope) => {
    if (!(await js(`Boolean(${button(pattern, scope)})`))) return false;
    await js(`${button(pattern, scope)}.click()`);
    await sleep(250);
    return true;
  };
  const shot = async (name) => {
    await sleep(600);
    let image = await win.webContents.capturePage();
    if (image.getSize().width !== 1600) image = image.resize({ width: 1600, height: 1000, quality: "best" });
    const file = path.join(outDir, `m1-smoke-${mode}-${name}.png`);
    await writeFile(file, image.toPNG());
    log("captured", file);
  };
  /** The two saves, wherever this mode keeps them. */
  const saves = async () => {
    if (mode === "electron") {
      const read = (name) => readFile(path.join(userData, name), "utf8").catch(() => null);
      return { intro: await read(INTRO_FILE), roll: await read(ROLL_FILE), files: await readdir(userData) };
    }
    return js(`({ intro: localStorage.getItem(${JSON.stringify(INTRO_KEY)}), roll: localStorage.getItem("doctrine-of-war:campaign:cinder_road"), files: Object.keys(localStorage) })`);
  };

  win.setContentSize(1600, 1000);
  await waitFor(`document.readyState === "complete"`, "load");
  if (mode === "web") {
    // A clean origin for this run.
    await js(`localStorage.clear()`);
    await win.webContents.reload();
    await waitFor(`document.readyState === "complete"`, "reload");
  }

  // 1. The intro, begun: its save is written.
  await click(/^Begin the Campaign$/, "Begin the Campaign");
  await waitFor(button(/Title screen/), "the campaign map");
  const introBefore = (await saves()).intro;
  if (!introBefore) throw new Error("the intro's save was not written");
  log("intro save written:", introBefore.length, "bytes");
  await click(/Title screen/, "Title screen");

  // 2. Cinder Road from Choose a campaign.
  await click(/^Choose a campaign$/, "Choose a campaign");
  await click(/^Begin: Cinder Road$/, "Begin: Cinder Road");
  await click(/Take the field: The Saltmarsh, Northbound/, "Take the field (map)");
  await waitFor(`document.querySelector(".post-map")`, "Call the Banners");
  const posts = await js(`[...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? "").filter((l) => /^Post \\d/.test(l))`);
  log("posts:", posts.join(" | "));
  if (posts.length !== 6 || !posts.some((post) => /The West Causeway/.test(post))) throw new Error("Call the Banners did not show Cinder Road's six named posts");
  await shot("call-the-banners");
  await click(/^Take the field$/, "Take the field (call)");

  // 3. Battle 1, played through with standing doctrines.
  await click(/^Take Command$/, "Take Command");
  await click(/^March to positions$/, "March to positions");
  const outcome = `document.querySelector(".outcome")`;
  let shotPlayback = false;
  for (let guard = 0; guard < 400; guard += 1) {
    if (await js(`Boolean(${outcome})`)) break;
    const intro = `document.querySelector('dialog[open]')`;
    if (await js(`Boolean(${intro}) && /Standing orders/.test(${intro}.textContent)`)) await tryClick(/^Continue$/, intro);
    if (await tryClick(/^See the outcome$/)) continue;
    if (await tryClick(/^Next Phase$/)) continue;
    if (await tryClick(/^Seal anyway$/)) continue;
    if (await tryClick(/^Seal Orders$/)) continue;
    if (await js(`Boolean(${button(/^Skip/)})`)) {
      if (!shotPlayback) {
        await sleep(1500);
        await shot("playback");
        shotPlayback = true;
      }
      await tryClick(/^Skip/);
      continue;
    }
    await sleep(250);
  }
  await waitFor(`${outcome} && /campaign saved|could not be saved/.test(${outcome}.textContent)`, "the outcome, saved");
  const result = await js(`${outcome}.textContent`);
  log("outcome:", result.replace(/\s+/g, " ").slice(0, 160));
  if (/could not be saved/.test(result)) throw new Error(`the Roll run was not saved: ${result}`);
  await shot("outcome");

  // 4. The saves: the run in its own file/key, the intro's untouched.
  const after = await saves();
  log("save files:", after.files.join(", "));
  if (!after.roll) throw new Error("Cinder Road's own save is missing");
  const run = JSON.parse(after.roll);
  const history = run.campaign?.history ?? run.state?.history ?? [];
  log("run:", JSON.stringify(run.provenance), "battles recorded:", history.length);
  if (run.provenance?.campaignId !== "cinder_road" || history.length !== 1) throw new Error("Cinder Road's save does not hold battle 1");
  if (after.intro !== introBefore) throw new Error("the intro's save changed");
  log("intro save unchanged: ok");

  // 5. A restart reads the run back.
  await win.webContents.reload();
  await waitFor(`document.readyState === "complete"`, "restart");
  await click(/^Choose a campaign$/, "Choose a campaign (after restart)");
  await waitFor(`[...document.querySelectorAll(".choice-card")].some((c) => /Cinder Road/.test(c.textContent) && /(In progress|Completed)/.test(c.textContent))`, "Cinder Road's run read back");
  log("run read back after restart: ok");
  await shot("choose-after");
}

app.whenReady().then(async () => {
  await mkdir(outDir, { recursive: true });
  let failed = false;
  const run = async (win) => {
    win.webContents.on("console-message", (details) => {
      if (details.level === "error") log("console error:", details.message);
    });
    try {
      await drive(win);
      log("PASS");
    } catch (error) {
      failed = true;
      log("FAIL:", error.message);
      await writeFile(path.join(outDir, `m1-smoke-${mode}-failure.png`), (await win.webContents.capturePage()).toPNG()).catch(() => {});
    } finally {
      rmSync(userData, { recursive: true, force: true });
      app.exit(failed ? 1 : 0);
    }
  };
  if (url) {
    const win = new BrowserWindow({ width: 1600, height: 1000, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: true } });
    await win.loadURL(url);
    await run(win);
  } else {
    app.once("browser-window-created", (_event, win) => {
      win.webContents.once("did-finish-load", () => void run(win));
    });
    // The real app: its whenReady() handler registers the save bridges and opens the window.
    await import(pathToFileURL(path.resolve("dist-electron/main.js")).href);
  }
});
