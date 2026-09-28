import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("doctrineOfWar", {
  platform: process.platform,
});
