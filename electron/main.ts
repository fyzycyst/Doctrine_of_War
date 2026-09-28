import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import { SAVE_READ_CHANNEL, SAVE_WRITE_CHANNEL } from "./saveChannels";
import { readSaveFile, writeSaveFile } from "./saveFile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Doctrine of War: Ash & Banner",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

/** Campaign saves: one fixed file in userData. The renderer never supplies a path. */
function registerSaveHandlers() {
  ipcMain.handle(SAVE_READ_CHANNEL, () => readSaveFile(app.getPath("userData")));
  ipcMain.handle(SAVE_WRITE_CHANNEL, (_event, data: unknown) => writeSaveFile(app.getPath("userData"), data));
}

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
