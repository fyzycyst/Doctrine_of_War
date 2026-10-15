// Cinder Road (M1 pilot): the counter-offensive, fought from the Roll. The morning after
// the Last Wall holds, the Banners march back down the road the Host came up. Battles
// are appended as they are built (battle 2: M2, C2); nothing ships until Cinder Road's
// length is frozen. Its own army: company ids never reuse
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
        // Two flex posts: a frontline company may ride the lances' post (and march on the
        // barricade) or take the bows' (and carry a banner with the assault). These are
        // the intended plan's templates for each role.
        flex: {
          outriders: { roles: ["cavalry", "frontline"], doctrines: { cavalry: "bring_the_water", frontline: "bring_the_water" } },
          bows: { roles: ["skirmish", "frontline"], doctrines: { skirmish: "rescue_standard", frontline: "rescue_standard" } },
        },
      },
    },
    {
      id: "cr_wagon_park",
      title: "Strike the Wagon Park",
      scenarioId: "cinder_road_wagon_park",
      // The authored call: battle 1's force, as the recommended force calls it after battle 1.
      slots: {
        ford_van: "coldwater_shields",
        track_van: "ferrymoot_pikes",
        sedge_van: "sedgewick_levy",
        lances: "sunward_lances",
        standard: "wickmere_standard",
        keepers: "heronwick_bows",
      },
      call: {
        labels: {
          ford_van: "The Wainford",
          track_van: "The Wagon Track",
          sedge_van: "The Sedge Flank",
          lances: "The Lance Line",
          standard: "Willow Rise",
          keepers: "The Weir Sluice",
        },
        // Two flex posts: a frontline company may ride the lances' post and march on the
        // park; a cavalry company may keep the sluice. These are the intended plan's
        // templates for each role.
        flex: {
          lances: { roles: ["cavalry", "frontline"], doctrines: { cavalry: "bring_the_water", frontline: "bring_the_water" } },
          keepers: { roles: ["skirmish", "cavalry"], doctrines: { skirmish: "hold_for_dawn", cavalry: "hold_for_dawn" } },
        },
      },
    },
    {
      id: "cr_ember_ford",
      title: "Open a Road",
      scenarioId: "cinder_road_ember_ford",
      slots: {
        ford_van: "coldwater_shields",
        road_van: "ferrymoot_pikes",
        chapel_van: "thornwick_spears",
        standard: "wickmere_standard",
        lances: "sunward_lances",
        bows: "heronwick_bows",
      },
      call: {
        // Where each post stands on our own bank before the crossing.
        labels: {
          ford_van: "The Cinder Ford",
          road_van: "The Ferry Road",
          chapel_van: "The North Bank",
          standard: "Watcher's Rise",
          lances: "The Mill Road",
          bows: "The Mill Ford",
        },
        // One flex post on the Mill Ford watch: a frontline company may hold the Mill Ford. The
        // Mill Road stays cavalry: a sturdy frontline there, rushed west with the column, wades
        // the Mill Ford and pins the reserve in the water by accident (the pure march then
        // skips the guard; docs/CAMPAIGN.md, the role rule).
        flex: {
          bows: { roles: ["skirmish", "frontline"], doctrines: { skirmish: "shield_the_line", frontline: "shield_the_line" } },
        },
      },
    },
    {
      id: "cr_gate_road",
      title: "Turn the Retreat",
      scenarioId: "cinder_road_gate_road",
      slots: {
        lances: "sunward_lances",
        riders: "brightcrag_riders",
        bows: "heronwick_bows",
        north_van: "coldwater_shields",
        road_van: "ferrymoot_pikes",
        south_van: "thornwick_spears",
      },
      call: {
        // Where each post lies: the riders in the folds of ground on either side of the Gate
        // Road ahead, the foot over the River Ford behind the column.
        labels: {
          lances: "The Broken Watch Folds",
          riders: "The South Works Folds",
          bows: "The South Ditch",
          north_van: "The North Bank",
          road_van: "The River Ford",
          south_van: "The South Bank",
        },
        // One flex post on the hunt: skirmishers may lie in the south folds.
        flex: {
          riders: { roles: ["cavalry", "skirmish"], doctrines: { cavalry: "clean_counterstroke", skirmish: "clean_counterstroke" } },
        },
      },
    },
    {
      // The finale (battle 5, after the harrying battle; re-gated on the full path [1, 2, 3, 4]).
      id: "cr_greyford_gate",
      title: "Break the Strongpoint",
      scenarioId: "cinder_road_greyford_gate",
      // The whole army: every company of the Roll has a post. The authored call is the
      // recommended force after battle 4 (the harrying battle).
      slots: {
        north_van: "coldwater_shields",
        gate_van: "ferrymoot_pikes",
        road_van: "sedgewick_levy",
        south_van: "thornwick_spears",
        standard: "wickmere_standard",
        bows: "morningwall_slingers",
        lances: "brightcrag_riders",
        riders: "sunward_lances",
        slingers: "heronwick_bows",
      },
      call: {
        labels: {
          north_van: "The North Ridge",
          gate_van: "The Gate Road",
          road_van: "The Siege Field",
          south_van: "The South Field",
          standard: "The River Ford",
          bows: "The Second Banner",
          lances: "The Upper Gate Road",
          riders: "The South Ford",
          slingers: "The Ford Bank",
        },
        // Two flex posts: the second banner may be carried by a frontline company, and a
        // frontline company may ride with the march on the Upper Gate Road. These are the
        // intended plan's templates for each role.
        flex: {
          bows: { roles: ["skirmish", "frontline"], doctrines: { skirmish: "rescue_standard", frontline: "rescue_standard" } },
          lances: { roles: ["cavalry", "frontline"], doctrines: { cavalry: "bring_the_water", frontline: "bring_the_water" } },
        },
      },
    },
  ],
};
