// Dev and captures only (`?mockRoll=…`): the shipped packs (the real Cinder Road) over the
// engine's own save store on in-memory storage, so the Roll screens can be seen and
// captured without touching the browser's real saves.
//   mockRoll=1         no saved Cinder Road run
//   mockRoll=carry     the intro completed, so starting Cinder Road offers carry-over
//   mockRoll=veterans  a Cinder Road run begun with veterans carried from the completed intro
//   mockRoll=stale     a run from another content edition (kept), with a good backup to restore
//   &rollBattle=1      straight into battle 1's briefing with the recommended force (then &stage=… as usual)
import {
  ashAndBanner,
  carryOverCandidates,
  cinderRoad,
  localStorageCampaignStore,
  localStorageKeyFor,
  recommendedForce,
  saveCampaign,
  serializeCampaignSave,
  snapshotCarryOver,
  startCampaign,
  type CampaignState,
} from "../../game/campaign";
import { firstCall, registry } from "../../game/packs";
import { campaignAfter } from "../flow/devCampaign";
import { useFlow } from "../flow/flowStore";
import { memoryStore } from "../flow/testKit";
import { engineRuns, installRollApi } from "./api";
import { memoryStorage } from "./memoryStorage";

/** How many veterans `mockRoll=veterans` brings. */
const DEV_VETERANS = 3;

const completedIntro = () => campaignAfter(ashAndBanner, ashAndBanner.battles.length, { fortune: "on" });

/** Cinder Road begun with the first few veterans the completed intro can lend. */
function veteranRun(): CampaignState {
  const intro = completedIntro();
  const ids = carryOverCandidates(ashAndBanner, intro, firstCall.id)
    .slice(0, DEV_VETERANS)
    .map((company) => company.id);
  return startCampaign(cinderRoad, { carryOver: snapshotCarryOver({ def: ashAndBanner, state: intro, packId: firstCall.id }, cinderRoad, ids) });
}

export function bootMockRoll(mode: string, rollBattle = false) {
  const storage = memoryStorage();
  const key = localStorageKeyFor(cinderRoad.id);
  let run: CampaignState | null = null;
  if (mode === "veterans") run = veteranRun();
  else if (rollBattle) run = startCampaign(cinderRoad);
  if (run) storage.setItem(key, serializeCampaignSave(registry, run));
  if (mode === "stale") {
    const good = serializeCampaignSave(registry, startCampaign(cinderRoad));
    const stale = JSON.parse(good);
    stale.provenance.contentRevision = 2;
    storage.setItem(key, JSON.stringify(stale));
    storage.setItem(`${key}:backup`, good);
  }
  installRollApi({ registry, runs: engineRuns(localStorageCampaignStore(storage), registry) });
  // The intro's own (v1) save: a completed run where carry-over reads it, else none.
  useFlow.setState({ store: memoryStore(mode === "carry" ? saveCampaign(completedIntro()) : null) });
  if (rollBattle && run) {
    // Synchronously, so the URL's stage and plan can play the battle on.
    const scenario = registry.scenario(cinderRoad.battles[0].scenarioId)!;
    useFlow.setState({ definition: cinderRoad, campaign: run });
    useFlow.getState().fieldBanners(recommendedForce(cinderRoad, run, scenario));
  }
}
