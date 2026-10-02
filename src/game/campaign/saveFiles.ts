// Per-campaign saves (M1, P3). One save per campaign, keyed by an ALLOWLISTED campaign
// id. The intro (Ash & Banner) keeps its v1 file and localStorage key, byte for byte as
// today: no migration. Every other campaign writes a v2 envelope that records the pack,
// content and rules revisions it was played on.
//
// A save that cannot be continued on this build (missing pack, other content or rules
// revision, or simply unreadable) is reported, preserved and never overwritten: writes
// refuse to replace it until the player explicitly sets it aside (which keeps a backup).
import type { PackRegistry, SaveProvenance } from "../packs/types";
import type { CampaignState } from "./types";

/** v2: the envelope for every campaign except the intro (which stays on v1). */
export const SAVE_VERSION_V2 = 2;

/** The campaign whose save is the untouched v1 file (and v1 localStorage key). */
export const INTRO_CAMPAIGN_ID = "ash_and_banner";

/**
 * The fixed allowlist: campaign id -> save file name in Electron's userData. The main
 * process keeps its own copy of this map and accepts no campaign id outside it; the
 * renderer never supplies a path. Add an entry when a campaign ships.
 */
export const CAMPAIGN_SAVE_FILES: Readonly<Record<string, string>> = Object.freeze({
  ash_and_banner: "campaign-save.json",
});

/** The browser's localStorage key for a campaign (the intro's is the shipped v1 key). */
export function localStorageKeyFor(campaignId: string): string {
  void campaignId;
  throw new Error("localStorageKeyFor: not implemented yet (M1 P3)");
}

/** A v2 save file. */
export interface CampaignSaveEnvelope {
  version: typeof SAVE_VERSION_V2;
  provenance: SaveProvenance;
  campaign: CampaignState;
}

/** What reading a campaign's save found. Nothing but `ok` may be continued; nothing but `empty` may be overwritten. */
export type CampaignSaveRead =
  | { kind: "empty" }
  | { kind: "ok"; state: CampaignState; provenance: SaveProvenance }
  /** A well-formed run this build cannot continue (other pack or revision): kept as is. */
  | { kind: "unavailable"; reason: string; provenance: SaveProvenance }
  /** Not a save this build can read at all: kept as is. */
  | { kind: "unreadable"; reason: string };

/** Serializes a campaign's state for its own file (v1 for the intro, v2 otherwise). Throws past the size budget. */
export function serializeCampaignSave(registry: PackRegistry, state: CampaignState): string {
  void registry;
  void state;
  throw new Error("serializeCampaignSave: not implemented yet (M1 P3)");
}

/** Parses one campaign's stored payload (null = no save) with full validation and replay. */
export function readCampaignSave(registry: PackRegistry, campaignId: string, payload: string | null): CampaignSaveRead {
  void registry;
  void campaignId;
  void payload;
  throw new Error("readCampaignSave: not implemented yet (M1 P3)");
}

/** Per-campaign storage: browser localStorage keys or Electron's allowlisted userData files. */
export interface CampaignSaveStore {
  read(campaignId: string): Promise<string | null>;
  /** Replaces the save (atomically in Electron); the previous good save is kept as its backup. */
  write(campaignId: string, data: string): Promise<void>;
  /** The last good save before the current one, or null. */
  readBackup(campaignId: string): Promise<string | null>;
  /** Moves an unavailable/unreadable save aside (to its backup) so a fresh run can start. */
  setAside(campaignId: string): Promise<void>;
}

/** Loads a campaign's run: `ok` to continue, or why not. Never writes. */
export async function loadCampaignRun(store: CampaignSaveStore, registry: PackRegistry, campaignId: string): Promise<CampaignSaveRead> {
  return readCampaignSave(registry, campaignId, await store.read(campaignId));
}

/**
 * Saves a run. Refuses (throws) when the file currently holds a run this build cannot
 * continue, or one of another campaign: preserved runs are never overwritten.
 */
export async function saveCampaignRun(store: CampaignSaveStore, registry: PackRegistry, state: CampaignState): Promise<void> {
  void store;
  void registry;
  void state;
  throw new Error("saveCampaignRun: not implemented yet (M1 P3)");
}
