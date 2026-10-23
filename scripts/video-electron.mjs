// Electron side of `npm run video` (T34): deterministic product-video clips from the real
// game. Each shot runs on the virtual clock (scripts/video-virtual-time.cjs, this window's
// preload): the page only moves when we step it, one video frame at a time, and every frame
// is captured and encoded. See scripts/video-capture.mjs and scripts/video-shots.mjs.
//
// A shot's timeline starts when its page is ready (t = 0). Actions fire at their `at` on that
// timeline; the clip is the `seconds` from `start` (or from `lead` before the `anchor` moment,
// found by a dry run of the same timeline), or several `parts` ([{ start, seconds }]) of one
// timeline joined with hard cuts. Same page, same steps, same frames.
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const { url, shots, outDir, keepFrames, trace } = JSON.parse(process.env.VIDEO_CONFIG ?? "{}");
const FPS = 30;
const STEP = 1000 / FPS;
const here = path.dirname(fileURLToPath(import.meta.url));

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.dock?.hide();

const js = (win, code) => win.webContents.executeJavaScript(code);
const step = (win, present) => js(win, `window.__vt.advance(${STEP}, { present: ${present} })`);
const truthy = async (win, expr) => Boolean(await js(win, `(() => { try { return Boolean(${expr}); } catch { return false; } })()`));

/**
 * A drawn pointer for UI shots (the OS cursor never shows in a capture). It glides on the
 * page's (virtual) clock, so it moves one frame per captured frame like everything else.
 */
const CURSOR = `(() => {
  if (window.__cursor) return;
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:28px;height:28px;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))";
  el.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.4 L17.5 13.4 Z" fill="#f2e6c9" stroke="#1a1414" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(el);
  let x = window.innerWidth * 0.62, y = window.innerHeight * 0.78, from = null, press = 0;
  const place = () => (el.style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px) scale(" + (1 - 0.18 * press) + ")");
  const tick = () => {
    if (from) {
      const k = Math.min(1, (performance.now() - from.t) / from.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      x = from.x + (from.tx - from.x) * e;
      y = from.y + (from.ty - from.y) * e;
      if (k >= 1) from = null;
    }
    press = Math.max(0, press - 0.12);
    place();
    requestAnimationFrame(tick);
  };
  window.__cursor = {
    glide: (tx, ty, ms) => (from = { x, y, tx, ty, t: performance.now(), ms: Math.max(1, ms) }),
    press: () => (press = 1),
  };
  place();
  requestAnimationFrame(tick);
})()`;

/** The tips a returning player has dismissed: none of the one-off guidance in frame. */
async function prepareStorage(win) {
  await win.loadURL(url);
  await js(
    win,
    `localStorage.setItem("doctrine-of-war.guide", JSON.stringify({ state: { introSeen: true, coach: "done", musterTipSeen: true, callHelpSeen: true }, version: 0 }))`,
  );
}

/** Loads the shot's page and steps the clock until it is ready, then `warm` more frames. */
async function open(win, shot) {
  await win.loadURL(shot.lab ? `${url}?lab=1&ui=0&${shot.query}` : `${url}?${shot.query}`);
  const ready = shot.ready ?? "window.__battleBoard?.ready";
  let frames = 0;
  while (!(await truthy(win, ready))) {
    await step(win, false);
    frames += 1;
    // Real time for fetches and decodes to land between virtual steps.
    if (frames % 15 === 0) await js(win, "window.__vt.realPause(40)");
    if (frames > 30 * 120) throw new Error(`${shot.id}: never ready (${ready})`);
  }
  for (let i = 0; i < (shot.warm ?? 30); i += 1) await step(win, false);
  if (shot.cursor) await js(win, CURSOR);
  if (shot.setup) await js(win, `(async () => { ${shot.setup} })()`);
}

/** The centre of the first element matching `selector` (CSS pixels), or null. */
const centre = (win, selector) =>
  js(win, `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

/** A timeline of the shot's actions; `run(frame)` fires everything due by that frame. */
function timeline(win, shot) {
  const queue = (shot.actions ?? []).map((a, k) => ({ ...a, frame: Math.round(a.at * FPS), k }));
  return async (frame) => {
    for (const a of queue) {
      if (a.done || frame < a.frame) continue;
      a.done = true;
      if (a.js) await js(win, `(async () => { ${a.js} })()`);
      if (a.hover || a.click) {
        const p = await centre(win, a.hover ?? a.click);
        if (!p) {
          console.warn(`${shot.id}: no element for ${a.hover ?? a.click} at ${a.at}s`);
          continue;
        }
        const glide = a.glide ?? (a.hover ? 0.5 : 0);
        if (glide > 0 && shot.cursor) {
          await js(win, `window.__cursor?.glide(${p.x}, ${p.y}, ${glide * 1000})`);
          // The real pointer arrives with the drawn one, so :hover lands on the same frame.
          queue.push({ frame: frame + Math.round(glide * FPS), move: p, click: a.click ? a.click : undefined, k: -1, at: a.at + glide });
          continue;
        }
        win.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(p.x), y: Math.round(p.y) });
        if (a.click) await clickAt(win, p);
      }
      if (a.move) {
        win.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(a.move.x), y: Math.round(a.move.y) });
        if (a.click) await clickAt(win, a.move);
      }
      if (a.key) {
        win.webContents.sendInputEvent({ type: "keyDown", keyCode: a.key });
        win.webContents.sendInputEvent({ type: "keyUp", keyCode: a.key });
      }
    }
  };
}

async function clickAt(win, p) {
  await js(win, "window.__cursor?.press()");
  const at = { x: Math.round(p.x), y: Math.round(p.y), button: "left", clickCount: 1 };
  win.webContents.sendInputEvent({ type: "mouseDown", ...at });
  win.webContents.sendInputEvent({ type: "mouseUp", ...at });
}

/** Steps the shot's timeline from ready to `frames`, firing its actions, without capturing. */
async function run(win, shot, frames, until) {
  const fire = timeline(win, shot);
  for (let i = 0; i < frames; i += 1) {
    await fire(i);
    if (until && (await truthy(win, until))) return { fire, frame: i };
    await step(win, false);
  }
  return { fire, frame: frames };
}

async function shoot(win, shot) {
  let start = Math.round((shot.start ?? 0) * FPS);
  if (shot.anchor) {
    // Dry run: find the frame the key moment lands on, then start `lead` seconds before it.
    await open(win, shot);
    const { frame } = await run(win, shot, 30 * 240, shot.anchor);
    if (frame >= 30 * 240) throw new Error(`${shot.id}: anchor never true (${shot.anchor})`);
    start = Math.max(0, frame - Math.round((shot.lead ?? 1.5) * FPS));
    console.log(`${shot.id}: anchor at ${(frame / FPS).toFixed(2)} s; clip starts at ${(start / FPS).toFixed(2)} s`);
  }
  // Capture windows on the timeline: one clip, or several parts cut together.
  const windows = (shot.parts ?? [{ start: start / FPS, seconds: shot.seconds }]).map((p) => [Math.round(p.start * FPS), Math.round((p.start + p.seconds) * FPS)]);
  const total = windows.reduce((n, [a, b]) => n + (b - a), 0);
  const end = Math.max(...windows.map(([, b]) => b));
  await open(win, shot);
  const fire = timeline(win, shot);
  const dir = path.join(outDir, ".frames", shot.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const luma = [];
  const cuts = new Set();
  const frame = (i) => path.join(dir, `f_${String(i).padStart(5, "0")}.png`);
  let n = 0;
  for (let t = 0; t < end; t += 1) {
    await fire(t);
    const inside = windows.some(([a, b]) => t >= a && t < b);
    await step(win, inside);
    if (!inside) continue;
    if (windows.some(([a]) => a === t) && n > 0) cuts.add(n);
    const image = await win.webContents.capturePage();
    await writeFile(frame(n), image.toPNG());
    luma.push(meanLuma(image));
    n += 1;
  }
  // A rare one-frame compositor glitch (a frame drawn mid-update): a frame far from both
  // neighbours while they agree is replaced by the one before it. Logged, never silent.
  for (let i = 1; i < total - 1; i += 1) {
    if (cuts.has(i) || cuts.has(i + 1)) continue; // a hard cut between parts is not a glitch
    const [a, b, c] = [luma[i - 1], luma[i], luma[i + 1]];
    if (Math.abs(b - a) > 6 && Math.abs(b - c) > 6 && Math.abs(a - c) < 3) {
      await copyFile(frame(i - 1), frame(i));
      luma[i] = a;
      console.log(`${shot.id}: frame ${i} was a one-frame glitch (luma ${b.toFixed(1)} vs ${a.toFixed(1)}); held the previous frame`);
    }
  }
  const file = path.join(outDir, `${shot.id}.mp4`);
  const ff = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, "f_%05d.png"), "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file],
    { stdio: "inherit" },
  );
  if (ff.status !== 0) throw new Error(`${shot.id}: ffmpeg failed`);
  if (!keepFrames) await rm(dir, { recursive: true, force: true });
  await updateManifest(shot, total / FPS);
  console.log(`wrote ${file} (${(total / FPS).toFixed(2)} s)`);
}

/** `--trace`: run the shot's timeline for `traceSeconds`, printing each new callout or caption. */
async function traceShot(win, shot) {
  await open(win, shot);
  const fire = timeline(win, shot);
  let last = "";
  for (let i = 0; i < Math.round((shot.traceSeconds ?? 40) * FPS); i += 1) {
    await fire(i);
    const now = await js(
      win,
      `[...document.querySelectorAll('[class*="callout"], [class*="caption"], [class*="Callout"], [class*="Caption"]')].map((e) => e.innerText.replace(/\\s+/g, " ").trim()).filter(Boolean).filter((t, i, all) => all.indexOf(t) === i && !all.some((o) => o !== t && o.includes(t))).join(" | ")`,
    );
    if (now !== last) console.log(`${shot.id} ${(i / FPS).toFixed(2)}s: ${now}`);
    last = now;
    await step(win, false);
  }
}

/** Mean luma (0..255) of a 32-px-wide thumbnail, for the glitch check. */
function meanLuma(image) {
  const small = image.resize({ width: 32 });
  const px = small.toBitmap(); // BGRA
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.0722 * px[i] + 0.7152 * px[i + 1] + 0.2126 * px[i + 2];
  return sum / (px.length / 4);
}

/** footage/manifest.json, merged shot by shot and kept in script order. */
async function updateManifest(shot, seconds) {
  const file = path.join(outDir, "manifest.json");
  let manifest = { shots: [] };
  try {
    manifest = JSON.parse(await readFile(file, "utf8"));
  } catch {
    // First clip.
  }
  const entry = { id: shot.id, file: `${shot.id}.mp4`, seconds: Math.round(seconds * 100) / 100, focalX: shot.focalX ?? 0.5, note: shot.note ?? "" };
  manifest.shots = [...manifest.shots.filter((s) => s.id !== shot.id), entry].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
}

app.whenReady().then(async () => {
  await mkdir(outDir, { recursive: true });
  let failed = 0;
  let prepared = false;
  for (const shot of shots) {
    const [width, height] = shot.size ?? [1920, 1080];
    const win = new BrowserWindow({
      width,
      height,
      useContentSize: true,
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: { preload: path.join(here, "video-virtual-time.cjs"), contextIsolation: false, sandbox: false, backgroundThrottling: false },
    });
    win.setContentSize(width, height);
    try {
      if (!prepared) {
        await prepareStorage(win);
        prepared = true;
      }
      await (trace ? traceShot(win, shot) : shoot(win, shot));
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${shot.id}: ${error.stack ?? error.message}`);
    }
    win.destroy();
  }
  app.exit(failed ? 1 : 0);
});
