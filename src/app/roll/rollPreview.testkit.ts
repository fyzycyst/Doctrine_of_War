// Tests only (never imported by the game or the dev boot): a two-battle Roll campaign, so
// the UI tests can see conditions carried from one battle's call into the next. The real
// Cinder Road has one battle so far. Names are placeholders, not canon.
import {
  ashAndBanner,
  assembleBattle,
  recommendedForce,
  recordBattle,
  snapshotCarryOver,
  startCampaign,
  type CampaignDefinition,
  type CampaignState,
} from "../../game/campaign";
import { emberFord, saltmarshColumn, type EngineScenario } from "../../game/engine";
import { playBattle } from "../../game/engine/balance";
import { firstCall, type PackManifest } from "../../game/packs";
import { campaignAfter } from "../flow/devCampaign";

/** The preview stands in for Cinder Road under its allowlisted save id. */
export const PREVIEW_CAMPAIGN_ID = "cinder_road";

/** The Saltmarsh board under its own id (scenario ids are unique across packs). */
export const crossingPreview: EngineScenario = { ...saltmarshColumn, id: "cr_crossing_preview", title: "Secure a Crossing (preview)" };
/** The Ember Ford board under its own id: a second built battle, so conditions carry into a real call. */
export const ashFieldsPreview: EngineScenario = { ...emberFord, id: "cr_ash_fields_preview", title: "The Ash Fields (preview)" };

export const cinderRoadPreview: CampaignDefinition = {
  id: PREVIEW_CAMPAIGN_ID,
  title: "Cinder Road (preview)",
  mode: "roll",
  companies: [
    { id: "cr_ashgate_shields", name: "Ashgate Shields", role: "frontline", startingResolve: 1, profile: { strength: 84, cohesion: 72 } },
    { id: "cr_saltgate_pikes", name: "Saltgate Pikes", role: "frontline", profile: { strength: 78, cohesion: 70 } },
    { id: "cr_heron_stair_guard", name: "Heron Stair Guard", role: "frontline", profile: { strength: 72, cohesion: 76 } },
    { id: "cr_fenmere_bowmen", name: "Fenmere Bowmen", role: "skirmish", profile: { strength: 66, cohesion: 70 } },
    { id: "cr_highwatch_slingers", name: "Highwatch Slingers", role: "skirmish", profile: { strength: 62, cohesion: 72 } },
    { id: "cr_covenant_standard", name: "Covenant Standard", role: "support", profile: { strength: 52, cohesion: 80 } },
    { id: "cr_causeway_riders", name: "Causeway Riders", role: "cavalry", profile: { strength: 70, cohesion: 66 } },
    { id: "cr_dawnward_lances", name: "Dawnward Lances", role: "cavalry", profile: { strength: 74, cohesion: 64 } },
  ],
  battles: [
    {
      id: "cr_crossing",
      title: "Secure a Crossing",
      scenarioId: crossingPreview.id,
      slots: {
        greyford_shields: "cr_ashgate_shields",
        dawnwatch_archers: "cr_fenmere_bowmen",
        mercy_standard: "cr_covenant_standard",
        stoneford_riders: "cr_causeway_riders",
        kestrel_lancers: "cr_dawnward_lances",
        mill_lane_guard: "cr_saltgate_pikes",
      },
      call: {
        // One flex post: the second rider's place may take a foot company instead.
        flex: { kestrel_lancers: { roles: ["cavalry", "frontline"], doctrines: { cavalry: "fighting_withdrawal", frontline: "shield_the_line" } } },
      },
    },
    {
      id: "cr_ash_fields",
      title: "The Ash Fields",
      scenarioId: ashFieldsPreview.id,
      slots: {
        tollbridge_pikes: "cr_ashgate_shields",
        ashfen_bowmen: "cr_fenmere_bowmen",
        lanternbearers: "cr_covenant_standard",
        harrow_riders: "cr_causeway_riders",
        kestrel_lancers: "cr_dawnward_lances",
        mill_lane_guard: "cr_saltgate_pikes",
        reedmarsh_levy: "cr_heron_stair_guard",
      },
    },
    ...["The Glass Road", "The Cold Kilns", "Saltgate Reclaimed", "Break the Strongpoint"].map((title, index) => ({
      id: `cr_${index + 3}`,
      title,
      scenarioId: `cr_unbuilt_${index + 3}`,
      slots: {},
      placeholder: true,
    })),
  ],
};

/** The shipped pack with the preview in place of the real Cinder Road. */
export const previewPack: PackManifest = {
  ...firstCall,
  campaigns: [...firstCall.campaigns.filter((item) => item.id !== PREVIEW_CAMPAIGN_ID), cinderRoadPreview],
  scenarios: [...firstCall.scenarios, crossingPreview, ashFieldsPreview],
};

export const previewPacks: PackManifest[] = [previewPack];

/**
 * A lived-in preview run: a veteran carried from the completed intro (as the engine
 * snapshots it), then battle 1 played for real with the recommended force, on the first
 * seed that leaves a company Worn. `before` is the state battle 1 was fought from.
 */
export function wornBattle(): { before: CampaignState; after: CampaignState } {
  const intro = campaignAfter(ashAndBanner, ashAndBanner.battles.length, { fortune: "on" });
  const carryOver = snapshotCarryOver({ def: ashAndBanner, state: intro, packId: firstCall.id }, cinderRoadPreview, ["greyford_shields"]);
  const start = startCampaign(cinderRoadPreview, { carryOver });
  let fallback: CampaignState | null = null;
  for (let seed = 1; seed <= 60; seed += 1) {
    const assignment = recommendedForce(cinderRoadPreview, start, crossingPreview);
    const scenario = assembleBattle(cinderRoadPreview, start, crossingPreview, assignment);
    const final = playBattle(scenario, scenario.referencePlans?.intended ?? {}, seed, "on");
    if (final.status === "defeat") continue;
    const after = recordBattle(cinderRoadPreview, start, final, { assignment });
    fallback ??= after;
    if (after.companies.some((company) => company.condition === "worn" || company.condition === "reforming")) return { before: start, after };
  }
  return { before: start, after: fallback ?? start };
}

export const wornRun = (): CampaignState => wornBattle().after;
