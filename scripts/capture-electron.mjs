// Electron side of `npm run capture`. See scripts/capture.mjs.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow } from "electron";

const { url, jobs, outDir } = JSON.parse(process.env.CAPTURE_CONFIG ?? "{}");
const WIDTH = 1600;
const HEIGHT = 1000;
const SETTLE_FRAMES = 240;
const TIMEOUT_MS = 90_000;

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.dock?.hide();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Jobs default to the Look Lab. An app job (scripts/capture-app.mjs) passes its own
// `query` (no lab params), `probe` (the window global to wait on) and `width`/`height`.
async function waitForSettle(win, probe = "__lookLab") {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < TIMEOUT_MS) {
    last = await win.webContents.executeJavaScript(`JSON.stringify(window.${probe} ?? null)`);
    const s = JSON.parse(last);
    if (s?.ready && s.frames >= SETTLE_FRAMES) return s;
    await sleep(250);
  }
  throw new Error(`timed out waiting for Look Lab to settle (last state: ${last})`);
}

/**
 * Frame-sequence job (`job.sequence = { frames, fps, start? }`): the lab runs with
 * `seq=1` (R3F frameloop "never") and exposes `window.__lookLabAdvance(t)`. We warm
 * the scene up at t≈0, then step the clock to start + i / fps for each frame and
 * capture it, so every frame is deterministic whatever the machine's speed.
 */
async function captureSequence(win, job, width, height) {
  const { frames, fps = 30, start = 0 } = job.sequence;
  const dir = path.join(outDir, job.name);
  await mkdir(dir, { recursive: true });
  const t0 = Date.now();
  while (!(await win.webContents.executeJavaScript("typeof window.__lookLabAdvance === 'function'"))) {
    if (Date.now() - t0 > TIMEOUT_MS) throw new Error("lab did not expose __lookLabAdvance (is seq=1 set?)");
    await sleep(100);
  }
  // Warm-up: compile shaders, mount figures, settle React state, without moving time.
  await win.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 150; i++) {
      window.__lookLabAdvance(${start} + i * 1e-4);
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
  })()`);
  for (let i = 0; i < frames; i += 1) {
    const t = start + i / fps;
    await win.webContents.executeJavaScript(`(async () => {
      window.__lookLabAdvance(${t});
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    })()`);
    let image = await win.webContents.capturePage();
    if (process.env.CAPTURE_SCALE !== "2" && image.getSize().width !== width) {
      image = image.resize({ width, height, quality: "best" });
    }
    await writeFile(path.join(dir, `frame_${String(i).padStart(4, "0")}.png`), image.toPNG());
  }
  console.log(`captured ${dir}/frame_0000..${String(frames - 1).padStart(4, "0")}.png (${frames} frames @ ${fps} fps)`);
}

app.whenReady().then(async () => {
  await mkdir(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: { backgroundThrottling: false },
  });
  let failed = 0;
  for (const job of jobs) {
    try {
      // Job params come first so they win over the defaults (URLSearchParams.get returns the first).
      const width = job.width ?? WIDTH;
      const height = job.height ?? HEIGHT;
      win.setContentSize(width, height);
      await win.loadURL(job.probe ? `${url}?${job.query}` : `${url}?lab=1&${job.query}&ui=0&still=1`);
      if (job.sequence) {
        await captureSequence(win, job, width, height);
        continue;
      }
      const state = await waitForSettle(win, job.probe);
      if (job.probe) await sleep(job.settleMs ?? 900); // let UI transitions finish
      let image = await win.webContents.capturePage();
      // Retina displays capture at 2x; downsample to the window size unless asked not to.
      if (process.env.CAPTURE_SCALE !== "2" && image.getSize().width !== width) {
        image = image.resize({ width, height, quality: "best" });
      }
      const file = path.join(outDir, `${job.name}.png`);
      await writeFile(file, image.toPNG());
      const size = image.getSize();
      console.log(`captured ${file} (${size.width}x${size.height}${state.fps ? `, ~${state.fps} fps` : ""})`);
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${job.name}: ${error.message}`);
    }
  }
  win.destroy();
  app.exit(failed ? 1 : 0);
});
