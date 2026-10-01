import { contextBridge, ipcRenderer } from "electron";
import { SAVE_EXPORT_CHANNEL, SAVE_READ_CHANNEL, SAVE_WRITE_CHANNEL, VARIANTS_READ_CHANNEL, VARIANTS_WRITE_CHANNEL } from "./saveChannels";

contextBridge.exposeInMainWorld("doctrineOfWar", {
  platform: process.platform,
  // Campaign saves: read/write one fixed userData file (see electron/saveFile.ts).
  saves: {
    read: (): Promise<string | null> => ipcRenderer.invoke(SAVE_READ_CHANNEL),
    write: (data: string): Promise<void> => ipcRenderer.invoke(SAVE_WRITE_CHANNEL, data),
    // No arguments: main reads its own save and asks the user where to put the copy.
    export: (): Promise<{ exported: boolean; reason?: string }> => ipcRenderer.invoke(SAVE_EXPORT_CHANNEL),
  },
  // Doctrine variants (T16): a second fixed userData file, same rules.
  variants: {
    read: (): Promise<string | null> => ipcRenderer.invoke(VARIANTS_READ_CHANNEL),
    write: (data: string): Promise<void> => ipcRenderer.invoke(VARIANTS_WRITE_CHANNEL, data),
  },
});
