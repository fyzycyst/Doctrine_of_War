// Settings → Support (T19): a copy of the campaign save for a bug report. In Electron the
// main process writes it where the user picks (a native dialog); on the web it downloads.
import type { SaveStore } from "../game/campaign";

export const EXPORT_FILE_NAME = "doctrine-of-war-save.json";

export type ExportOutcome = "exported" | "cancelled" | "no-save";

export async function exportSave(store: SaveStore): Promise<ExportOutcome> {
  const bridge = typeof window === "undefined" ? undefined : window.doctrineOfWar?.saves;
  if (bridge?.export) {
    const result = await bridge.export();
    return result.exported ? "exported" : result.reason === "no-save" ? "no-save" : "cancelled";
  }
  const data = await store.read();
  if (data === null) return "no-save";
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = EXPORT_FILE_NAME;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return "exported";
}
