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

async function waitForSettle(win) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < TIMEOUT_MS) {
    last = await win.webContents.executeJavaScript("JSON.stringify(window.__lookLab ?? null)");
    const s = JSON.parse(last);
    if (s?.ready && s.frames >= SETTLE_FRAMES) return s;
    await sleep(250);
  }
  throw new Error(`timed out waiting for Look Lab to settle (last state: ${last})`);
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
      await win.loadURL(`${url}?lab=1&${job.query}&ui=0&still=1`);
      const state = await waitForSettle(win);
      let image = await win.webContents.capturePage();
      // Retina displays capture at 2x; downsample to the window size unless asked not to.
      if (process.env.CAPTURE_SCALE !== "2" && image.getSize().width !== WIDTH) {
        image = image.resize({ width: WIDTH, height: HEIGHT, quality: "best" });
      }
      const file = path.join(outDir, `${job.name}.png`);
      await writeFile(file, image.toPNG());
      const { width, height } = image.getSize();
      console.log(`captured ${file} (${width}x${height}, ~${state.fps} fps)`);
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${job.name}: ${error.message}`);
    }
  }
  win.destroy();
  app.exit(failed ? 1 : 0);
});
