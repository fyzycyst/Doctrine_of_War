// Settings → Support (T19): a copy of a campaign's save for a bug report. In Electron the
// main process writes it where the user picks (a native dialog); on the web it downloads.
// M1: any campaign's save; the intro's goes exactly as before (its own store, no id).
import { INTRO_CAMPAIGN_ID, type SaveStore } from "../game/campaign";
import { runs } from "./roll/api";

export const EXPORT_FILE_NAME = "doctrine-of-war-save.json";

/** The downloaded file's name: the intro keeps the original; other campaigns name themselves. */
export const exportFileName = (campaignId: string) => (campaignId === INTRO_CAMPAIGN_ID ? EXPORT_FILE_NAME : `doctrine-of-war-${campaignId}-save.json`);

export type ExportOutcome = "exported" | "cancelled" | "no-save";

export async function exportSave(store: SaveStore, campaignId: string = INTRO_CAMPAIGN_ID): Promise<ExportOutcome> {
  const intro = campaignId === INTRO_CAMPAIGN_ID;
  const bridge = typeof window === "undefined" ? undefined : window.doctrineOfWar?.saves;
  if (bridge?.export) {
    // Main reads its own allowlisted file for the id; the intro's call carries none.
    const result = intro ? await bridge.export() : await bridge.export(campaignId);
    return result.exported ? "exported" : result.reason === "no-save" ? "no-save" : "cancelled";
  }
  const data = intro ? await store.read() : await runs().payload(campaignId);
  if (data === null) return "no-save";
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(campaignId);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return "exported";
}
