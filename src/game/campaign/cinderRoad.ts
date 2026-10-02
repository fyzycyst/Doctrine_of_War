// Cinder Road (M1 pilot): the counter-offensive, fought from the Roll. The morning after
// the Last Wall holds, the Banners march back down the road the Host came up. Only
// battle 1 is authored for the pilot; the rest are appended before release (nothing
// ships until Cinder Road's length is frozen). Its own army: company ids never reuse
// the intro's (intro companies arrive only by carry-over). Home realms per the setting
// bible (lore v2): the Greyford March holds, the Fenwardens withdraw and rescue, the
// Dawnwatch Holds wait, then strike. Profiles sit inside PROFILE_BANDS.
import type { CampaignDefinition } from "./types";

export const cinderRoad: CampaignDefinition = {
  id: "cinder_road",
  title: "Cinder Road",
  mode: "roll",
  companies: [
    // The Greyford March.
    { id: "coldwater_shields", name: "Coldwater Shields", role: "frontline", realm: "greyford_march", startingResolve: 1, profile: { strength: 84, cohesion: 74 } },
    { id: "ferrymoot_pikes", name: "Ferrymoot Pikes", role: "frontline", realm: "greyford_march", profile: { strength: 80, cohesion: 70 } },
    { id: "thornwick_spears", name: "Thornwick Spears", role: "frontline", realm: "greyford_march", profile: { strength: 76, cohesion: 68 } },
    // The Fenwardens.
    { id: "sedgewick_levy", name: "Sedgewick Levy", role: "frontline", realm: "fenwardens", profile: { strength: 72, cohesion: 64 } },
    { id: "wickmere_standard", name: "Wickmere Standard", role: "support", realm: "fenwardens", profile: { strength: 52, cohesion: 82 } },
    { id: "heronwick_bows", name: "Heronwick Bows", role: "skirmish", realm: "fenwardens", profile: { strength: 64, cohesion: 70 } },
    // The Dawnwatch Holds.
    { id: "sunward_lances", name: "Sunward Lances", role: "cavalry", realm: "dawnwatch_holds", profile: { strength: 72, cohesion: 66 } },
    { id: "brightcrag_riders", name: "Brightcrag Riders", role: "cavalry", realm: "dawnwatch_holds", profile: { strength: 68, cohesion: 64 } },
    { id: "morningwall_slingers", name: "Morningwall Slingers", role: "skirmish", realm: "dawnwatch_holds", profile: { strength: 62, cohesion: 68 } },
  ],
  battles: [
    {
      id: "cr_saltmarsh",
      title: "The Saltmarsh, Northbound",
      scenarioId: "cinder_road_saltmarsh",
      // The authored call: the recommended force starts here.
      slots: {
        van_west: "coldwater_shields",
        van_centre: "ferrymoot_pikes",
        van_east: "sedgewick_levy",
        outriders: "sunward_lances",
        standard: "wickmere_standard",
        bows: "heronwick_bows",
      },
      call: {
        // Where each post stands on the march north (the selection screen's post names).
        labels: {
          van_west: "The West Causeway",
          van_centre: "The Hummock Line",
          van_east: "The East Causeway",
          outriders: "The Causeway Van",
          standard: "Heron Stair",
          bows: "Wickmere Landing",
        },
        // Two flex posts: a frontline company may ride the lances' post or take the bows'.
        // Every role marches on the barricade there (the intended plan's template).
        flex: {
          outriders: { roles: ["cavalry", "frontline"], doctrines: { cavalry: "bring_the_water", frontline: "bring_the_water" } },
          bows: { roles: ["skirmish", "frontline"], doctrines: { skirmish: "bring_the_water", frontline: "bring_the_water" } },
        },
      },
    },
  ],
};
