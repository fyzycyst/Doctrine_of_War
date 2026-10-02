// In-memory per-campaign runs (M1): a stand-in for the engine's save store (P3) while it
// lands. Dev (`?mockRoll=…`) and tests only. Like the real store, it never overwrites a
// run this build cannot continue.
import type { CampaignSaveRead } from "../../game/campaign";
import type { PackRegistry } from "../../game/packs";
import type { RunStore } from "./api";

/** In-memory runs: `seed` may pre-set what a campaign's read finds (e.g. an unavailable run). */
export function memoryRuns(registry: PackRegistry, seed: Record<string, CampaignSaveRead> = {}): RunStore & { reads: Record<string, CampaignSaveRead> } {
  const reads: Record<string, CampaignSaveRead> = { ...seed };
  return {
    reads,
    async load(campaignId) {
      return structuredClone(reads[campaignId] ?? { kind: "empty" });
    },
    async save(state) {
      const there = reads[state.campaignId];
      if (there && there.kind !== "ok" && there.kind !== "empty") throw new Error("A saved run this build cannot continue is kept; it was not overwritten.");
      const found = registry.campaign(state.campaignId);
      reads[state.campaignId] = {
        kind: "ok",
        state: structuredClone(state),
        provenance: { packId: found?.pack.id ?? "unknown", campaignId: state.campaignId, contentRevision: 1, rulesRevision: 1 },
      };
    },
  };
}
