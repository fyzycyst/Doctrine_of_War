// The hackathon campaign: tutorial, then three battles (tech plan §5). Saltmarsh
// Column and Hold for Dawn are placeholders until T12 builds them.
import type { CampaignDefinition } from "./types";

export const ashAndBanner: CampaignDefinition = {
  id: "ash_and_banner",
  title: "Ash & Banner",
  companies: [
    // The tutorial's companies keep the Resolve the tutorial was balanced around.
    { id: "greyford_shields", name: "Greyford Shields", role: "frontline", startingResolve: 2 },
    { id: "dawnwatch_archers", name: "Dawnwatch Archers", role: "skirmish", startingResolve: 1 },
    { id: "mercy_standard", name: "Mercy Standard", role: "support", startingResolve: 0 },
    { id: "stoneford_riders", name: "Stoneford Riders", role: "cavalry", startingResolve: -1 },
    // Companies that join at Ember Ford arrive fresh (Resolve 0).
    { id: "kestrel_lancers", name: "Kestrel Lancers", role: "cavalry" },
    { id: "mill_lane_guard", name: "Mill Lane Guard", role: "frontline" },
    { id: "reedmarsh_levy", name: "Reedmarsh Levy", role: "frontline" },
  ],
  battles: [
    {
      id: "tutorial",
      title: "The First Breach",
      scenarioId: "first_breach",
      slots: {
        greyford_shields: "greyford_shields",
        dawnwatch_archers: "dawnwatch_archers",
        mercy_standard: "mercy_standard",
        stoneford_riders: "stoneford_riders",
      },
    },
    {
      id: "battle_1",
      title: "Ember Ford",
      scenarioId: "ember_ford",
      // The Greyford veterans take the Ferry Road pikes' post, and so on.
      slots: {
        tollbridge_pikes: "greyford_shields",
        ashfen_bowmen: "dawnwatch_archers",
        lanternbearers: "mercy_standard",
        harrow_riders: "stoneford_riders",
        kestrel_lancers: "kestrel_lancers",
        mill_lane_guard: "mill_lane_guard",
        reedmarsh_levy: "reedmarsh_levy",
      },
    },
    { id: "battle_2", title: "The Saltmarsh Column", scenarioId: "saltmarsh_column", placeholder: true, slots: {} },
    { id: "battle_3", title: "Hold for Dawn", scenarioId: "hold_for_dawn", placeholder: true, slots: {} },
  ],
};
