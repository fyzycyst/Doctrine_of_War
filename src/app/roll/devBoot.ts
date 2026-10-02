// Dev and captures only (`?mockRoll=…`): the preview pack (src/app/roll/fixtures.ts) and
// the engine's own save store over in-memory storage, so the Roll screens can be seen
// before real Roll content lands.
//   mockRoll=1      the preview campaign with no saved run
//   mockRoll=worn   battle 1 played for real (a carried veteran along), so battle 2's Roll shows the conditions it left
//   mockRoll=carry  the intro completed, so starting the preview offers carry-over
//   mockRoll=stale  a run from another content edition (kept), with a good backup to restore
import {
  ashAndBanner,
  assembleBattle,
  localStorageCampaignStore,
  recommendedForce,
  recordBattle,
  localStorageKeyFor,
  saveCampaign,
  serializeCampaignSave,
  startCampaign,
  type CampaignState,
} from "../../game/campaign";
import { createRegistry } from "../../game/packs";
import { campaignAfter } from "../flow/devCampaign";
import { memoryStore } from "../flow/testKit";
import { useFlow } from "../flow/flowStore";
import { engineRuns, installRollApi } from "./api";
import { playBattle } from "../../game/engine/balance";
import { cinderRoadPreview, crossingPreview, previewPacks, PREVIEW_CAMPAIGN_ID } from "./fixtures";
import { memoryStorage } from "./memoryStorage";

/**
 * A preview run with a lived-in Roll: a veteran carried from the intro, then battle 1 played
 * for real with the recommended force, on the first seed that leaves a company Worn.
 */
export function wornRun(): CampaignState {
  const start = startCampaign(cinderRoadPreview, {
    carryOver: [
      {
        id: "greyford_shields",
        name: "Greyford Shields",
        role: "frontline",
        profile: { strength: 84, cohesion: 74 },
        resolve: 2,
        renown: { title: "The Iron Hinge" },
        from: { packId: "first_call", campaignId: "ash_and_banner" },
      },
    ],
  });
  let fallback: CampaignState | null = null;
  for (let seed = 1; seed <= 60; seed += 1) {
    const assignment = recommendedForce(cinderRoadPreview, start, crossingPreview);
    const scenario = assembleBattle(cinderRoadPreview, start, crossingPreview, assignment);
    const final = playBattle(scenario, scenario.referencePlans?.intended ?? {}, seed, "on");
    if (final.status === "defeat") continue;
    const after = recordBattle(cinderRoadPreview, start, final, { assignment });
    fallback ??= after;
    if (after.companies.some((company) => company.condition === "worn" || company.condition === "reforming")) return after;
  }
  return fallback ?? start;
}

export function bootMockRoll(mode: string) {
  const registry = createRegistry(previewPacks);
  const storage = memoryStorage();
  const key = localStorageKeyFor(PREVIEW_CAMPAIGN_ID);
  if (mode === "worn") storage.setItem(key, serializeCampaignSave(registry, wornRun()));
  if (mode === "stale") {
    const good = serializeCampaignSave(registry, startCampaign(cinderRoadPreview));
    const stale = JSON.parse(good);
    stale.provenance.contentRevision = 2;
    storage.setItem(key, JSON.stringify(stale));
    storage.setItem(`${key}:backup`, good);
  }
  installRollApi({ registry, runs: engineRuns(localStorageCampaignStore(storage), registry) });
  if (mode === "carry") {
    // The intro's own (v1) save holds a completed run, where "Choose a campaign" reads it.
    const done = campaignAfter(ashAndBanner, ashAndBanner.battles.length, { fortune: "on" });
    useFlow.setState({ store: memoryStore(saveCampaign(done)) });
  }
}
