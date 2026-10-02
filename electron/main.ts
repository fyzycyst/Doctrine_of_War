import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  SAVE_BACKUP_CHANNEL,
  SAVE_EXPORT_CHANNEL,
  SAVE_READ_CHANNEL,
  SAVE_SET_ASIDE_CHANNEL,
  SAVE_WRITE_CHANNEL,
  VARIANTS_READ_CHANNEL,
  VARIANTS_WRITE_CHANNEL,
} from "./saveChannels";
import {
  exportSaveFile,
  readCampaignBackup,
  readCampaignFile,
  readVariantsFile,
  setAsideCampaignFile,
  writeCampaignFile,
  writeVariantsFile,
} from "./saveFile";
import { isAppUrl, isTrustedSender, type AppLocation } from "./security";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const devServerUrl = process.env.VITE_DEV_SERVER_URL || undefined;
const indexFile = path.join(__dirname, "../dist/index.html");
const appLocation: AppLocation = { indexUrl: pathToFileURL(indexFile).href, devServerUrl };

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Doctrine of War: Ash & Banner",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(indexFile);
  }
}

/**
 * Every web contents (the window, and anything it might spawn) stays on the app:
 * no navigation or redirect elsewhere, no new windows, no <webview>.
 */
function lockDownContents() {
  app.on("web-contents-created", (_event, contents) => {
    const blockForeign = (event: Electron.Event, url: string) => {
      if (!isAppUrl(url, appLocation)) {
        event.preventDefault();
        console.warn(`[security] blocked navigation to ${url}`);
      }
    };
    contents.on("will-navigate", (event) => blockForeign(event, event.url));
    contents.on("will-frame-navigate", (event) => blockForeign(event, event.url));
    contents.on("will-redirect", (event) => blockForeign(event, event.url));
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      console.warn(`[security] blocked window.open of ${url}`);
      return { action: "deny" };
    });
  });
}

function trusted(event: IpcMainInvokeEvent, channel: string): void {
  if (!isTrustedSender(event.senderFrame, appLocation)) {
    console.warn(`[security] rejected ${channel} from ${event.senderFrame?.url ?? "a destroyed frame"}`);
    throw new Error("save bridge is only available to the app");
  }
}

/**
 * Campaign saves: one fixed userData file per campaign. The renderer supplies at most a
 * campaign id, which saveFile.ts checks against main's own allowlist (MAIN_SAVE_FILES);
 * with no id it is the intro's original file. The renderer never supplies a path.
 */
function registerSaveHandlers() {
  ipcMain.handle(SAVE_READ_CHANNEL, (event, campaignId: unknown) => {
    trusted(event, SAVE_READ_CHANNEL);
    return readCampaignFile(app.getPath("userData"), campaignId);
  });
  ipcMain.handle(SAVE_WRITE_CHANNEL, (event, data: unknown, campaignId: unknown) => {
    trusted(event, SAVE_WRITE_CHANNEL);
    return writeCampaignFile(app.getPath("userData"), campaignId, data);
  });
  ipcMain.handle(SAVE_BACKUP_CHANNEL, (event, campaignId: unknown) => {
    trusted(event, SAVE_BACKUP_CHANNEL);
    return readCampaignBackup(app.getPath("userData"), campaignId);
  });
  ipcMain.handle(SAVE_SET_ASIDE_CHANNEL, (event, campaignId: unknown) => {
    trusted(event, SAVE_SET_ASIDE_CHANNEL);
    return setAsideCampaignFile(app.getPath("userData"), campaignId);
  });
  // Support (T19): a copy of the save to a path the user picks in the native dialog.
  ipcMain.handle(SAVE_EXPORT_CHANNEL, (event, campaignId: unknown) => {
    trusted(event, SAVE_EXPORT_CHANNEL);
    const owner = BrowserWindow.fromWebContents(event.sender);
    // The default name comes from saveFile.ts (main's allowlist), never from the renderer.
    return exportSaveFile(app.getPath("userData"), async (defaultName) => {
      const options = {
        title: "Export save file",
        defaultPath: path.join(app.getPath("documents"), defaultName),
        filters: [{ name: "Save file", extensions: ["json"] }],
      };
      const { canceled, filePath } = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
      return canceled || !filePath ? null : filePath;
    }, undefined, campaignId);
  });
  // Doctrine variants (T16): a second fixed file, same checks.
  ipcMain.handle(VARIANTS_READ_CHANNEL, (event) => {
    trusted(event, VARIANTS_READ_CHANNEL);
    return readVariantsFile(app.getPath("userData"));
  });
  ipcMain.handle(VARIANTS_WRITE_CHANNEL, (event, data: unknown) => {
    trusted(event, VARIANTS_WRITE_CHANNEL);
    return writeVariantsFile(app.getPath("userData"), data);
  });
}

lockDownContents();

app.whenReady().then(() => {
  registerSaveHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
