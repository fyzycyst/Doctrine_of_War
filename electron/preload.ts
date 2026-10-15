import { contextBridge, ipcRenderer } from "electron";
import {
  SAVE_BACKUP_CHANNEL,
  SAVE_EXPORT_CHANNEL,
  SAVE_READ_CHANNEL,
  SAVE_SET_ASIDE_CHANNEL,
  SAVE_WRITE_CHANNEL,
  VARIANTS_READ_CHANNEL,
  VARIANTS_WRITE_CHANNEL,
} from "./saveChannels";

contextBridge.exposeInMainWorld("doctrineOfWar", {
  platform: process.platform,
  // Campaign saves: read/write one fixed userData file (see electron/saveFile.ts).
  saves: {
    // An optional campaign id picks the save (default: the intro); main allowlists it.
    read: (campaignId?: string): Promise<string | null> => ipcRenderer.invoke(SAVE_READ_CHANNEL, campaignId),
    write: (data: string, campaignId?: string): Promise<void> => ipcRenderer.invoke(SAVE_WRITE_CHANNEL, data, campaignId),
    readBackup: (campaignId: string): Promise<string | null> => ipcRenderer.invoke(SAVE_BACKUP_CHANNEL, campaignId),
    setAside: (campaignId: string): Promise<void> => ipcRenderer.invoke(SAVE_SET_ASIDE_CHANNEL, campaignId),
    // No arguments: main reads its own save and asks the user where to put the copy.
    export: (campaignId?: string): Promise<{ exported: boolean; reason?: string }> => ipcRenderer.invoke(SAVE_EXPORT_CHANNEL, campaignId),
  },
  // Doctrine variants (T16): a second fixed userData file, same rules.
  variants: {
    read: (): Promise<string | null> => ipcRenderer.invoke(VARIANTS_READ_CHANNEL),
    write: (data: string): Promise<void> => ipcRenderer.invoke(VARIANTS_WRITE_CHANNEL, data),
  },
});
