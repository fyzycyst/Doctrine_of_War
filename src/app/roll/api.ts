// The UI's one door to the Roll and to per-campaign saves (M1, P6). It defaults to the
// engine (src/game/campaign: roll.ts, saveFiles.ts) and the shipped pack registry.
// Tests, and the dev-only `?mockRoll=1` boot, swap in a stand-in (src/app/roll/fake.ts)
// while the engine's implementations land; nothing else in the UI changes when they do.
import {
  assembleBattle,
  battleThreat,
  carryOverCandidates,
  loadCampaignRun,
  recommendedForce,
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
}

/** Per-campaign runs: read (never writes) and save (refuses to overwrite a preserved run). */
export interface RunStore {
  load(campaignId: string): Promise<CampaignSaveRead>;
  save(state: CampaignState): Promise<void>;
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
};

/** Runs over the engine's per-campaign save store (P3), once the build provides one. */
export function engineRuns(store: CampaignSaveStore | null, registry: PackRegistry): RunStore {
  return {
    async load(campaignId) {
      if (!store) return { kind: "unreadable", reason: "Saved runs are not available in this build yet." };
      try {
        return await loadCampaignRun(store, registry, campaignId);
      } catch (error) {
        // Fail closed: a run this build cannot read is reported, never touched.
        return { kind: "unreadable", reason: error instanceof Error ? error.message : "The saved run could not be read." };
      }
    },
    save: (state) => {
      if (!store) return Promise.reject(new Error("Saved runs are not available in this build yet."));
      return saveCampaignRun(store, registry, state);
    },
  };
}

let current: { roll: RollApi; registry: PackRegistry; runs: RunStore } = {
  roll: engineRoll,
  registry: shippedRegistry,
  runs: engineRuns(null, shippedRegistry),
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
