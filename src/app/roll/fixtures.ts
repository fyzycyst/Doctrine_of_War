// A preview Roll campaign for building and testing the Roll UI before Cinder Road's first
// battle lands (M1 P5). Dev (`?mockRoll=1`) and tests only: never in the shipped registry.
// Its first battle stands on the Saltmarsh board; names are placeholders, not canon.
import type { CampaignDefinition } from "../../game/campaign";
import { saltmarshColumn, type EngineScenario } from "../../game/engine";
import { firstCall, type PackManifest } from "../../game/packs";

export const PREVIEW_CAMPAIGN_ID = "cinder_road_preview";

/** The Saltmarsh board under its own id (scenario ids are unique across packs). */
export const crossingPreview: EngineScenario = { ...saltmarshColumn, id: "cr_crossing_preview", title: "Secure a Crossing (preview)" };

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
    ...["The Ash Fields", "The Glass Road", "The Cold Kilns", "Saltgate Reclaimed", "Break the Strongpoint"].map((title, index) => ({
      id: `cr_${index + 2}`,
      title,
      scenarioId: `cr_unbuilt_${index + 2}`,
      slots: {},
      placeholder: true,
    })),
  ],
};

/** A second preview campaign whose saved run this build cannot continue (for the honest-status path). */
export const causewayPreview: CampaignDefinition = {
  id: "causeway_war_preview",
  title: "The Causeway War (preview)",
  mode: "roll",
  companies: [{ id: "cw_causeway_guard", name: "Causeway Guard", role: "frontline", profile: { strength: 76, cohesion: 70 } }],
  battles: [{ id: "cw_1", title: "The Causeway", scenarioId: "cw_unbuilt_1", slots: {}, placeholder: true }],
};

export const previewPack: PackManifest = {
  id: "first_call_preview",
  title: "The First Call (preview)",
  revision: { pack: 1, content: 1, rules: 1 },
  readsContent: [1],
  campaigns: [cinderRoadPreview, causewayPreview],
  scenarios: [crossingPreview],
  doctrines: [],
  skirmishes: [],
};

/** The shipped pack and the preview pack, as a test/dev registry sees them. */
export const previewPacks: PackManifest[] = [firstCall, previewPack];
