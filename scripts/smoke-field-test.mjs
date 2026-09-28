// Real-worker smoke test for "Test in the field" (T16), on production builds.
//
//   ELECTRON=1 npx vite build && npx electron scripts/smoke-field-test.mjs
//       Runs the REAL Electron app (dist-electron/main.js: its window, sandbox, preload,
//       file:// load and production CSP), with userData redirected to a temp folder.
//   npx vite build && npx vite preview --port 4179 &
//   SMOKE_URL=http://localhost:4179/ npx electron scripts/smoke-field-test.mjs
//       The web build as served, CSP meta included.
//
// Drives the UI with real clicks (title → battle → hand → "Edit a copy…" → the editor →
// Test in the field: cancel once, then run to the end), records CSP violations, and
// saves screenshots to captures/app/t16-<mode>-*.png. Exits non-zero on failure.
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow } from "electron";

const url = process.env.SMOKE_URL;
const mode = url ? "web" : "electron";
const outDir = path.resolve("captures/app");
const userData = mkdtempSync(path.join(os.tmpdir(), "dow-smoke-"));
app.setPath("userData", userData);
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log(`[smoke:${mode}]`, ...args);

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
    `[...${scope}.querySelectorAll("button")].find((b) => ${pattern}.test(b.textContent) || ${pattern}.test(b.getAttribute("aria-label") ?? ""))`;
  const click = async (pattern, what, scope) => {
    await waitFor(`${button(pattern, scope)} && !${button(pattern, scope)}.disabled`, what);
    await js(`${button(pattern, scope)}.click()`);
    await sleep(250);
  };
  const shot = async (name) => {
    await sleep(600);
    let image = await win.webContents.capturePage();
    if (image.getSize().width !== 1600) image = image.resize({ width: 1600, height: 1000, quality: "best" });
    const file = path.join(outDir, `t16-${mode}-${name}.png`);
    await writeFile(file, image.toPNG());
    log("captured", file);
  };

  win.setContentSize(1600, 1000);
  await waitFor(`document.readyState === "complete"`, "load");
  await js(`window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));`);
  const csp = await js(`document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null`);
  log("CSP meta:", csp);
  if (!csp || !/worker-src 'self'/.test(csp)) throw new Error("production CSP meta with worker-src 'self' is missing");

  await click(/^Begin the Campaign$/, "Begin the Campaign");
  await click(/Take the field: The First Breach/, "Take the field");
  await sleep(800);
  const intro = `document.querySelector('dialog[open]')`;
  if (await js(`Boolean(${intro}) && /Standing orders/.test(${intro}.textContent)`)) await click(/^Continue$/, "intro Continue", intro);
  await click(/^Take Command$/, "Take Command");
  await click(/^March to positions$/, "March to positions");
  await waitFor(`document.querySelector('[data-squad="greyford_shields"]')`, "roster");
  await js(`document.querySelector('[data-squad="greyford_shields"]').click()`);
  await click(/Edit a copy/, "Edit a copy…");

  // Cut a variant: brace first, cohesion threshold 20 → 30, a name.
  const editor = `document.querySelector("dialog.editor")`;
  await waitFor(editor, "the editor");
  await click(/^Move order 2 up$/, "move up", editor);
  await click(/^Raise to 25$/, "raise", editor);
  await click(/^Raise to 30$/, "raise", editor);
  await js(`(() => {
    const input = ${editor}.querySelector("input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "Shield the Line (Veteran's cut)");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await shot("editor");

  // Cancel mid-run: the worker is terminated and nothing is reported. (A short run can
  // finish in well under a second, so Run and Cancel are clicked in the same task.)
  const cancelled = await js(`(async () => {
    ${button(/^Run the test$/, editor)}.click();
    await Promise.resolve(); // React commits the click's update in a microtask
    const cancel = ${button(/^\s*Cancel$/, editor)};
    if (!cancel) return false;
    cancel.click();
    return true;
  })()`);
  if (!cancelled) throw new Error("no Cancel button while the test ran");
  await sleep(1500);
  if (await js(`Boolean(${editor}.querySelector(".field-test-verdict, progress"))`)) throw new Error("a cancelled test still reported");
  log("cancel: ok");

  const started = Date.now();
  await click(/^Run the test$/, "Run the test", editor);
  const sawProgress = await js(`Boolean(${editor}.querySelector("progress"))`);
  await waitFor(`${editor}.querySelector(".field-test-verdict")`, "the verdict", 180_000);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const verdict = await js(`${editor}.querySelector(".field-test-verdict").textContent`);
  const table = await js(
    `[...${editor}.querySelectorAll(".field-test-detail, .field-test-bars li, .field-test-note")].map((r) => r.textContent).join(" | ")`,
  );
  log(`result in ${seconds} s (progress bar seen: ${sawProgress}):`, verdict, "::", table);
  await js(`${editor}.querySelector(".field-test").scrollIntoView({ block: "end" })`);
  await shot("fieldtest-result");

  // Save it: ordered for the company, and in the hand.
  await click(/^Save variant$/, "Save variant", editor);
  await waitFor(`/ordered for this company/.test(${editor}.textContent)`, "saved");
  // An extreme cut (fall back first, below 90 cohesion) must read as a clear difference,
  // not noise. (With "brace" first, the threshold barely matters: a company in contact braces.)
  await click(/^Move order 2 up$/, "fall back first", editor);
  for (let value = 35; value <= 90; value += 5) await click(new RegExp(`^Raise to ${value}$`), `raise to ${value}`, editor);
  await click(/^Run again$/, "Run again", editor);
  await waitFor(`${editor}.querySelector(".field-test-verdict") && !${editor}.querySelector("progress")`, "the second verdict", 180_000);
  const clear = await js(`[...${editor}.querySelectorAll(".field-test-verdict, .field-test-detail, .field-test-note")].map((r) => r.textContent).join(" | ")`);
  log("extreme cut:", clear);
  if (!/^Clearly (better|worse)/.test(clear)) throw new Error("the extreme cut did not read as a clear difference");
  await js(`${editor}.querySelector(".field-test").scrollIntoView({ block: "end" })`);
  await shot("fieldtest-clear");
  await click(/^Close$/, "Close", editor);
  await waitFor(`!${editor}`, "editor closed");
  await js(`document.querySelector('.hand [role="option"][aria-selected="true"]')?.focus()`);
  await shot("hand-variant");

  const violations = await js(`window.__csp`);
  log("CSP violations:", violations.length ? violations : "none");
  if (violations.length) throw new Error(`CSP violations: ${violations.join("; ")}`);
}

app.whenReady().then(async () => {
  await mkdir(outDir, { recursive: true });
  let failed = false;
  const run = async (win) => {
    win.webContents.on("console-message", (details) => {
      if (details.level === "error" || details.level === "warning") log(`console ${details.level}:`, details.message);
    });
    try {
      await drive(win);
      log("PASS");
    } catch (error) {
      failed = true;
      log("FAIL:", error.message);
      await writeFile(path.join(outDir, `t16-${mode}-failure.png`), (await win.webContents.capturePage()).toPNG()).catch(() => {});
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
