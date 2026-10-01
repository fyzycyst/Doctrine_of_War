// Electron side of `npm run audio:demo`. See scripts/audio-demo.mjs.
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow } from "electron";

const { url, outDir } = JSON.parse(process.env.AUDIO_DEMO_CONFIG ?? "{}");
const TIMEOUT_MS = 120_000;
app.dock?.hide();

app.whenReady().then(async () => {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { backgroundThrottling: false } });
  await win.loadURL(url);
  const t0 = Date.now();
  let demos = null;
  while (!demos) {
    if (Date.now() - t0 > TIMEOUT_MS) {
      console.error("audio demo timed out");
      app.exit(1);
      return;
    }
    demos = await win.webContents.executeJavaScript("window.__audioDemo ?? null");
    if (!demos) await new Promise((r) => setTimeout(r, 250));
  }
  const orchestra = await win.webContents.executeJavaScript("window.__audioDemoOrchestra ?? 'unknown'");
  const report = [`orchestra samples: ${orchestra}`];
  for (const [name, d] of Object.entries(demos)) {
    await writeFile(path.join(outDir, `${name}.wav`), Buffer.from(d.wav, "base64"));
    report.push(`${name}.wav  ${d.seconds}s  peak ${d.peakDb} dBFS  rms ${d.rmsDb} dBFS`);
  }
  await writeFile(path.join(outDir, "levels.txt"), report.join("\n") + "\n");
  console.log(report.join("\n"));
  app.exit(0);
});
