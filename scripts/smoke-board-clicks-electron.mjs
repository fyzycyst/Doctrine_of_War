// Electron side of `npm run smoke:board-clicks` (see scripts/smoke-board-clicks.mjs).
//
// For each case: load the battle from the URL, arm a company, find where a target hex is on
// screen (its centre projected through the board's own camera, read from R3F's root), and
// click there with real mouse input, so whatever is on top at that point (HUD, figure or
// island) gets the click, as it would for a player. Then check the store for the plan.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow } from "electron";

const url = process.env.SMOKE_URL;
const only = process.env.SMOKE_ONLY;
const outDir = path.resolve("captures/app");
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.dock?.hide();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PHASE_TWO = "stage=command&phase=2&plan=intended";
const CASES = [
  { name: "muster-tutorial", query: `${PHASE_TWO}&coach=muster&select=stoneford_riders`, armed: "stoneford_riders", kind: "muster" },
  { name: "muster", query: `${PHASE_TWO}&select=stoneford_riders`, armed: "stoneford_riders", kind: "muster" },
  { name: "relief-tutorial", query: `${PHASE_TWO}&coach=relieve&select=mercy_standard`, armed: "mercy_standard", kind: "relief" },
  { name: "relief", query: `${PHASE_TWO}&select=mercy_standard`, armed: "mercy_standard", kind: "relief" },
].filter((c) => !only || c.name.includes(only));

// Where the armed company's first target (a muster hex, or the company it may relieve) is on screen.
const TARGET = (armed, kind) => `(async () => {
  const resource = (part) => performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes(part));
  const { useGame } = await import("/src/app/game/gameStore.ts");
  const { musterTargets } = await import("/src/app/game/muster.ts");
  const { boardCenter, hexToWorld } = await import("/src/render/hexWorld.ts");
  const THREE = await import(resource("/deps/three.js"));
  const { _roots } = await import(resource("/deps/@react-three_fiber.js"));
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  const { scene, camera } = _roots.get(canvas).store.getState();
  const game = useGame.getState();
  const targets = musterTargets(game.engine, game.scenario, game.muster, ${JSON.stringify(armed)});
  const hex = ${kind === "muster" ? "targets.hexes[0]" : "game.view.squads.find((s) => s.id === targets.relieve[0])?.hex"};
  if (!hex) return JSON.stringify({ error: "no target for " + ${JSON.stringify(armed)} });
  const [x, z] = hexToWorld(hex, boardCenter(game.scenario.board));
  const down = new THREE.Raycaster(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0));
  const ground = down.intersectObjects(scene.children, true).find((hit) => hit.object.isMesh && !hit.object.isInstancedMesh);
  const v = new THREE.Vector3(x, ground ? ground.point.y : 0, z).project(camera);
  const point = [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
  const top = document.elementFromPoint(point[0], point[1]);
  return JSON.stringify({ hex, point, top: top ? top.tagName.toLowerCase() + (top.className ? "." + top.className : "") : null });
})().catch((error) => JSON.stringify({ error: String(error) }))`;

const STATE = `(async () => {
  const { useAppStore } = await import("/src/app/store.ts");
  const { useGame } = await import("/src/app/game/gameStore.ts");
  const { useGuide } = await import("/src/app/guide/guideStore.ts");
  const guide = useGuide.getState();
  return JSON.stringify({ muster: useGame.getState().muster, selected: useAppStore.getState().selectedSquadId, step: guide.coach === "active" && !guide.off ? guide.step : null });
})()`;

async function waitForBoard(win) {
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    const board = JSON.parse(await win.webContents.executeJavaScript("JSON.stringify(window.__battleBoard ?? null)"));
    if (board?.ready && board.frames >= 240) return;
    await sleep(250);
  }
  throw new Error("timed out waiting for the board");
}

async function click(win, [x, y]) {
  const at = { x: Math.round(x), y: Math.round(y) };
  win.webContents.sendInputEvent({ type: "mouseMove", ...at });
  await sleep(60);
  win.webContents.sendInputEvent({ type: "mouseDown", ...at, button: "left", clickCount: 1 });
  await sleep(40);
  win.webContents.sendInputEvent({ type: "mouseUp", ...at, button: "left", clickCount: 1 });
  await sleep(400);
}

app.whenReady().then(async () => {
  await mkdir(outDir, { recursive: true });
  const win = new BrowserWindow({ width: 1600, height: 1000, useContentSize: true, show: false, paintWhenInitiallyHidden: true, webPreferences: { backgroundThrottling: false } });
  let failed = 0;
  for (const c of CASES) {
    try {
      await win.loadURL(`${url}?${c.query}`);
      await waitForBoard(win);
      await sleep(1200);
      const target = JSON.parse(await win.webContents.executeJavaScript(TARGET(c.armed, c.kind)));
      if (target.error) throw new Error(target.error);
      const before = JSON.parse(await win.webContents.executeJavaScript(STATE));
      await click(win, target.point);
      const after = JSON.parse(await win.webContents.executeJavaScript(STATE));
      const planned = after.muster.find((move) => move.squadId === c.armed && (c.kind === "relief" ? "relieve" in move : "to" in move));
      const kept = after.selected === c.armed;
      const image = await win.webContents.capturePage();
      await writeFile(path.join(outDir, `t33-click-${c.name}.png`), image.resize({ width: 1600, height: 1000, quality: "best" }).toPNG());
      const line = `${c.name}: clicked hex ${target.hex.q},${target.hex.r} (on top: ${target.top}); step ${before.step} → ${after.step}; plan ${JSON.stringify(after.muster)}; selected ${after.selected}`;
      if (planned && kept) console.log(`ok   ${line}`);
      else {
        failed += 1;
        console.error(`FAIL ${line}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${c.name}: ${error.message}`);
    }
  }
  win.destroy();
  app.exit(failed ? 1 : 0);
});
