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
  // The dev server occasionally drops a load (ERR_FAILED) while it re-optimizes: retry.
  // A capture-only page zoom (shot.zoom): the HTML overlay (rule callouts, banners, UI)
  // renders that much larger; the 3D view keeps its framing. The app's "ultra" render scale
  // (set below) keeps the canvas at full resolution behind it.
  win.webContents.setZoomFactor(shot.zoom ?? 1);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await win.loadURL(shot.lab ? `${url}?lab=1&ui=0&${shot.query}` : `${url}?${shot.query}`);
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      console.warn(`${shot.id}: load failed (${error.message.split("\n")[0]}); retrying`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  win.webContents.setZoomFactor(shot.zoom ?? 1);
  if ((shot.zoom ?? 1) > 1) await js(win, "window.__dow?.app.setState({ ultra: true })");
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

/**
 * The centre of the first element matching `selector` (CSS pixels), or null. `text=Label`
 * matches a button, link or option by its visible text.
 */
const centre = (win, selector) =>
  js(
    win,
    `(() => {
      const sel = ${JSON.stringify(selector)};
      const e = sel.startsWith("text=")
        ? [...document.querySelectorAll("button, a, [role=option], [role=button]")].find((x) => x.innerText.trim() === sel.slice(5) && x.getClientRects().length)
        : document.querySelector(sel);
      if (!e) return null;
      e.scrollIntoView?.({ block: "nearest" });
      const r = e.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      // Overlapping UI (a fanned hand): is the target what a click there would hit?
      const at = document.elementFromPoint(x, y);
      window.__videoTarget = e;
      return { x, y, hit: Boolean(at && (e === at || e.contains(at))) };
    })()`,
  );

/** A timeline of the shot's actions; `run(frame)` fires everything due by that frame. */
function timeline(win, shot) {
  const zoom = shot.zoom ?? 1;
  const queue = (shot.actions ?? []).map((a, k) => ({ ...a, frame: Math.round(a.at * FPS), k }));
  return async (frame) => {
    for (const a of queue) {
      if (a.done || frame < a.frame) continue;
      a.done = true;
      if (a.js) await js(win, `(async () => { ${a.js} })()`);
      if (a.waitFor) {
        // Work off the virtual clock (the field test's Web Worker): the page keeps stepping (its
        // own timers must fire) but the shot's timeline and the capture hold until it lands.
        const t0 = Date.now();
        while (!(await truthy(win, a.waitFor))) {
          if (Date.now() - t0 > 180_000) throw new Error(`${shot.id}: waitFor never true (${a.waitFor})`);
          await step(win, false);
          await js(win, "window.__vt.realPause(30)");
        }
      }
      // A glide's arrival (`move`) carries its click: it lands once, below, not here too.
      if ((a.hover || a.click) && !a.move) {
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
        win.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(p.x * zoom), y: Math.round(p.y * zoom) });
        if (a.click) await clickAt(win, p, zoom);
      }
      if (a.move) {
        win.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(a.move.x * zoom), y: Math.round(a.move.y * zoom) });
        if (a.click) await clickAt(win, { ...a.move, hit: (await centre(win, a.click))?.hit }, zoom);
      }
      if (a.key) {
        win.webContents.sendInputEvent({ type: "keyDown", keyCode: a.key });
        win.webContents.sendInputEvent({ type: "keyUp", keyCode: a.key });
      }
    }
  };
}

async function clickAt(win, p, zoom = 1) {
  await js(win, "window.__cursor?.press()");
  if (p.hit === false) {
    // Something overlaps the target at its centre: click the element itself.
    await js(win, "window.__videoTarget?.click()");
    return;
  }
  // Input events are in window pixels; the page's CSS pixels are scaled by the zoom.
  const at = { x: Math.round(p.x * zoom), y: Math.round(p.y * zoom), button: "left", clickCount: 1 };
  win.webContents.sendInputEvent({ type: "mouseDown", ...at });
  win.webContents.sendInputEvent({ type: "mouseUp", ...at });
}

// The visible in-world callouts' horizontal spans, as [left, right, opacity, text], 0..1 of the width.
const CALLOUT_SPANS = `[...document.querySelectorAll(".callout")].flatMap((e) => {
  const r = e.getBoundingClientRect(), o = Number(getComputedStyle(e).opacity);
  // On screen only, clipped to it (a callout parked off the edge is not in the shot).
  const l = Math.max(0, r.left / innerWidth), rt = Math.min(1, r.right / innerWidth);
  return rt > l && r.height > 0 && r.bottom > 0 && r.top < innerHeight && o > 0.3 ? [[l, rt, o, e.innerText.replace(/\\s+/g, " ").trim().slice(0, 80)]] : [];
})`;
const BAND = 1080 * (9 / 16) / 1920; // the centre 9:16 crop, as a share of the width

/**
 * `focalX: "auto"`: the crop centre that keeps the most callout-time inside the 9:16 band
 * (each frame's callouts, by the share of each span inside), nearest the middle on ties.
 * Returns { focalX, held } (held: that share, 0..1), or null with no callouts at all.
 */
/**
 * The share (0..1) of the callout-time in `frames` inside the band centred on `f`. With `on`
 * (a RegExp: the shot's key callout, `focalOn`), the matching callouts count five times over.
 */
function heldAt(frames, f, on) {
  const spans = frames.flat().map(([l, r, w, text]) => [l, r, w * (on?.test(text ?? "") ? 5 : 1)]);
  const total = spans.reduce((n, [l, r, w]) => n + (r - l) * w, 0);
  return spans.reduce((n, [l, r, w]) => n + Math.max(0, Math.min(r, f + BAND / 2) - Math.max(l, f - BAND / 2)) * w, 0) / total;
}

function bestFocal(frames, on) {
  if (frames.flat().length === 0) return null;
  let best = null;
  for (let f = BAND / 2; f <= 1 - BAND / 2 + 1e-9; f += 0.005) {
    const held = heldAt(frames, f, on);
    if (!best || held > best.held + 1e-6 || (Math.abs(held - best.held) <= 1e-6 && Math.abs(f - 0.5) < Math.abs(best.focalX - 0.5))) best = { focalX: f, held };
  }
  return { focalX: Math.round(best.focalX * 100) / 100, held: best.held };
}

/** The shot's crop centre: its own focalX, or with "auto" the callouts' (`spans`, per frame). */
function focalOf(shot, spans) {
  const on = shot.focalOn ? new RegExp(shot.focalOn, "i") : undefined;
  if (shot.focalX !== "auto") {
    const f = shot.focalX ?? 0.5;
    if (spans.flat().length) console.log(`${shot.id}: focalX ${f} (set) holds ${(heldAt(spans, f) * 100).toFixed(0)}% of the callouts in the 9:16 band`);
    return f;
  }
  const found = bestFocal(spans, on);
  if (!found) return 0.5;
  const key = on ? `; ${(heldAt(spans.map((f) => f.filter(([, , , t]) => on.test(t ?? ""))), found.focalX) * 100).toFixed(0)}% of /${shot.focalOn}/` : "";
  console.log(`${shot.id}: focalX ${found.focalX} holds ${(heldAt(spans, found.focalX) * 100).toFixed(0)}% of the callouts in the 9:16 band${key}`);
  return found.focalX;
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
  const spans = [];
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
    spans.push(await js(win, CALLOUT_SPANS));
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
  // capturePage returns device pixels (3840x2160 on a Retina display): scale to the clip's size.
  const [w, h] = shot.size ?? [1920, 1080];
  const ff = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, "f_%05d.png"), "-vf", `scale=${w}:${h}:flags=lanczos`, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file],
    { stdio: "inherit" },
  );
  if (ff.status !== 0) throw new Error(`${shot.id}: ffmpeg failed`);
  if (!keepFrames) await rm(dir, { recursive: true, force: true });
  // Kept for a joined shot's crop (concatShot).
  await writeFile(path.join(outDir, ".frames", `${shot.id}.spans.json`), JSON.stringify(spans));
  await updateManifest(shot, total / FPS, focalOf(shot, spans));
  console.log(`wrote ${file} (${(total / FPS).toFixed(2)} s)`);
}

/** A shot made of other clips (`concat: [ids]`), joined end to end (same encoding, no re-encode). */
async function concatShot(shot) {
  const { existsSync } = await import("node:fs");
  const missing = shot.concat.filter((id) => !existsSync(path.join(outDir, `${id}.mp4`)));
  if (missing.length) throw new Error(`${shot.id}: render ${missing.join(", ")} first`);
  const list = path.join(outDir, ".frames", `${shot.id}.txt`);
  await mkdir(path.dirname(list), { recursive: true });
  await writeFile(list, shot.concat.map((id) => `file '${path.join(outDir, `${id}.mp4`)}'`).join("\n") + "\n");
  const file = path.join(outDir, `${shot.id}.mp4`);
  const ff = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", file], { stdio: "inherit" });
  if (ff.status !== 0) throw new Error(`${shot.id}: ffmpeg concat failed`);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const seconds = Number(probe.stdout.trim());
  const spans = [];
  for (const id of shot.concat) spans.push(...JSON.parse(await readFile(path.join(outDir, ".frames", `${id}.spans.json`), "utf8").catch(() => "[]")));
  await updateManifest(shot, seconds, focalOf(shot, spans));
  console.log(`wrote ${file} (${seconds.toFixed(2)} s, ${shot.concat.join(" + ")})`);
}

/** `--trace`: run the shot's timeline for `traceSeconds`, printing each new callout or caption. */
async function traceShot(win, shot) {
  await open(win, shot);
  const fire = timeline(win, shot);
  let last = "";
  for (let i = 0; i < Math.round((shot.traceSeconds ?? 40) * FPS); i += 1) {
    await fire(i);
    const now = shot.traceExpr ? String(await js(win, `(() => { try { return ${shot.traceExpr}; } catch (e) { return "ERR " + e.message; } })()`)) : await js(
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
async function updateManifest(shot, seconds, focalX) {
  const file = path.join(outDir, "manifest.json");
  let manifest = { shots: [] };
  try {
    manifest = JSON.parse(await readFile(file, "utf8"));
  } catch {
    // First clip.
  }
  const entry = { id: shot.id, file: `${shot.id}.mp4`, seconds: Math.round(seconds * 100) / 100, focalX, note: shot.note ?? "" };
  manifest.shots = [...manifest.shots.filter((s) => s.id !== shot.id), entry].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
}

// Each shot destroys its window before the next opens: without this, Electron's default quits
// the app in that gap, aborting the next shot's load (ERR_FAILED) and then the whole run.
app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  await mkdir(outDir, { recursive: true });
  let failed = 0;
  let prepared = false;
  for (const shot of shots) {
    if (shot.concat) {
      if (!trace) {
        try {
          await concatShot(shot);
        } catch (error) {
          failed += 1;
          console.error(`FAILED ${shot.id}: ${error.message}`);
        }
      }
      continue;
    }
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
