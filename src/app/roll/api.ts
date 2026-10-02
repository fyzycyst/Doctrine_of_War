// The UI's one door to the Roll and to per-campaign saves (M1, P6): the engine
// (src/game/campaign: roll.ts, saveFiles.ts), the shipped pack registry and the default
// save store. Tests, and the dev-only `?mockRoll=…` boot, swap in a registry with the
// preview pack and the engine's own store over in-memory storage.
import {
  assembleBattle,
  battleThreat,
  carriedFielded,
  carryOverCandidates,
  defaultCampaignStore,
  loadCampaignBackup,
  loadCampaignRun,
  recommendedForce,
  readCampaignSave,
  recordBattle,
  rollFor,
  rollSlots,
  saveCampaignRun,
  snapshotCarryOver,
  validateAssignment,
  type CampaignSaveRead,
  type CampaignSaveStore,
  type CampaignState,
} from "../../game/campaign";
import { registry as shippedRegistry, type PackRegistry } from "../../game/packs";

export interface RollApi {
  rollFor: typeof rollFor;
  rollSlots: typeof rollSlots;
  recommendedForce: typeof recommendedForce;
  validateAssignment: typeof validateAssignment;
  battleThreat: typeof battleThreat;
  assembleBattle: typeof assembleBattle;
  recordBattle: typeof recordBattle;
  carryOverCandidates: typeof carryOverCandidates;
  snapshotCarryOver: typeof snapshotCarryOver;
  carriedFielded: typeof carriedFielded;
}

/** Per-campaign runs (P3). Reads never write; a save refuses to replace a run that must be preserved. */
export interface RunStore {
  load(campaignId: string): Promise<CampaignSaveRead>;
  /** The run in the backup slot (the save before the current one). */
  loadBackup(campaignId: string): Promise<CampaignSaveRead>;
  save(state: CampaignState): Promise<void>;
  /** Moves the current save aside (kept, never deleted) so a fresh run can start. */
  setAside(campaignId: string): Promise<void>;
  /**
   * The saved run's text as stored, for Support → Export (null: no run). A run this build
   * cannot continue is still exported; a damaged file is refused (as Electron's main does).
   */
  payload(campaignId: string): Promise<string | null>;
}

const engineRoll: RollApi = {
  rollFor,
  rollSlots,
  recommendedForce,
  validateAssignment,
  battleThreat,
  assembleBattle,
  recordBattle,
  carryOverCandidates,
  snapshotCarryOver,
  carriedFielded,
};

/** Runs over the engine's per-campaign save store. Reads fail closed: anything that throws is reported unreadable. */
export function engineRuns(store: CampaignSaveStore, registry: PackRegistry): RunStore {
  const safely = async (read: () => Promise<CampaignSaveRead>): Promise<CampaignSaveRead> => {
    try {
      return await read();
    } catch (error) {
      return { kind: "unreadable", reason: error instanceof Error ? error.message : "The saved run could not be read." };
    }
  };
  return {
    load: (campaignId) => safely(() => loadCampaignRun(store, registry, campaignId)),
    loadBackup: (campaignId) => safely(() => loadCampaignBackup(store, registry, campaignId)),
    save: (state) => saveCampaignRun(store, registry, state),
    setAside: (campaignId) => store.setAside(campaignId),
    payload: async (campaignId) => {
      const data = await store.read(campaignId);
      if (data !== null && readCampaignSave(registry, campaignId, data).kind === "unreadable") throw new Error("save file is not readable");
      return data;
    },
  };
}

let current: { roll: RollApi; registry: PackRegistry; runs: RunStore } = {
  roll: engineRoll,
  registry: shippedRegistry,
  runs: engineRuns(defaultCampaignStore(), shippedRegistry),
};

/** The Roll's functions (engine, or the installed stand-in). */
export const roll = (): RollApi => current.roll;
/** The packs this build offers (shipped, or a test/dev registry). */
export const packs = (): PackRegistry => current.registry;
/** Per-campaign saved runs. */
export const runs = (): RunStore => current.runs;

/** Tests and dev only: swap any part of the seam. Returns a function that restores it. */
export function installRollApi(next: Partial<{ roll: Partial<RollApi>; registry: PackRegistry; runs: RunStore }>): () => void {
  const before = current;
  current = {
    roll: { ...current.roll, ...next.roll },
    registry: next.registry ?? current.registry,
    runs: next.runs ?? current.runs,
  };
  return () => {
    current = before;
  };
}
