// Cinder Road, battle 1: The Saltmarsh, Northbound. The morning after the Last Wall
// holds, the Banners march back up the road the Host came down, by daylight, across
// the same drowned marsh the column crossed southbound. The Host has thrown a
// barricade of fire-pots and timber across the Saltgate Causeway to hold the crossing;
// its marsh hunters still lie in the reeds along the way. Banner initiative, under fog.
// Lesson (the star is Bring the Water, the Advance): the companies cannot see the
// hunters, but every commander's map shows the barricade, so the assault marches on it
// in step and breaks it; a standard keeps it standing when the Drowned Hounds rise from
// the reeds. Lances that gallop up the causeway alone are cut off in the reeds.
// Registered in the First Call pack (packs/registry.ts), not in the intro's scenario list.
import type { BoardHex, BoardLayout, TerrainType } from "../../board";
import type { EngineScenario } from "../types";

const WIDTH = 7;
const HEIGHT = 8;
export const SALTGATE_BARRICADE = { q: 3, r: 1 };

// The intro's Saltmarsh, unchanged: two causeways through the marsh, reed banks, hummocks.
const causeways = new Set(["3,0", "3,1", "3,2", "3,3", "2,4", "2,5", "2,6", "2,7", "5,2", "5,3", "4,4", "4,5", "4,6", "4,7"]);
const reeds = new Set(["1,1", "5,0", "0,3", "6,3", "1,5", "5,6", "3,4"]);
const hummocks = new Set(["2,1", "4,1", "2,2", "4,2", "3,5", "3,6", "1,3", "5,4"]);

const labels: Record<string, string> = {
  "3,0": "Saltgate Causeway",
  "3,1": "Saltgate Barricade",
  "2,7": "Heron Stair",
  "4,7": "Wickmere Landing",
  "1,1": "Whisper Reeds",
  "5,6": "Drowned Reeds",
};

function terrainAt(q: number, r: number): TerrainType {
  const key = `${q},${r}`;
  if (causeways.has(key)) return "road";
  if (reeds.has(key)) return "reeds";
  if (hummocks.has(key)) return "field";
  return "marsh";
}

function hexAt(q: number, r: number): BoardHex {
  const key = `${q},${r}`;
  return {
    coord: { q, r },
    terrain: terrainAt(q, r),
    ...(labels[key] ? { label: labels[key] } : {}),
    ...(key === "3,1" ? { objectiveId: "saltgate_barricade" } : {}),
    ...(r >= 5 ? { deploymentFaction: "free_banners" as const } : {}),
    ...(r <= 1 ? { deploymentFaction: "ashen_host" as const } : {}),
  };
}

const board: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

export const cinderRoad1: EngineScenario = {
  id: "cinder_road_saltmarsh",
  title: "The Saltmarsh, Northbound",
  briefing:
    "The Host has barred the Saltgate Causeway with timber and fire-pots, and its hunters still lie somewhere in the reeds. " +
    "We cannot see them, but we know where the barricade stands: march on it together, and let no company reach it alone. " +
    "Keep a standard with the assault. Break the barricade before the day is out and the crossing is ours.",
  playerFaction: "free_banners",
  initiativeSide: "free_banners",
  maxPhases: 7,
  timeOfDay: "day",
  curatedSeed: 23,
  board,
  objectives: [
    {
      id: "saltgate_barricade",
      name: "The Saltgate Barricade",
      description: "Break the barricade across the causeway head before the day is out.",
      hex: SALTGATE_BARRICADE,
      integrity: 36,
      defender: "ashen_host",
    },
  ],
  playerDoctrineIds: ["bring_the_water", "shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke"],
  squads: [
    // The slots of the Cinder Road call (squad id = slot id), in activation order.
    { id: "van_west", name: "Coldwater Shields", faction: "free_banners", role: "frontline", hex: { q: 2, r: 6 }, strength: 84, cohesion: 74, resolve: 1, doctrineId: "bring_the_water" },
    { id: "van_centre", name: "Ferrymoot Pikes", faction: "free_banners", role: "frontline", hex: { q: 3, r: 6 }, strength: 80, cohesion: 70, resolve: 0, doctrineId: "bring_the_water" },
    { id: "van_east", name: "Sedgewick Levy", faction: "free_banners", role: "frontline", hex: { q: 4, r: 6 }, strength: 72, cohesion: 64, resolve: 0, doctrineId: "bring_the_water" },
    { id: "outriders", name: "Sunward Lances", faction: "free_banners", role: "cavalry", hex: { q: 4, r: 5 }, strength: 72, cohesion: 66, resolve: 0, doctrineId: "bring_the_water" },
    { id: "standard", name: "Wickmere Standard", faction: "free_banners", role: "support", hex: { q: 2, r: 7 }, strength: 52, cohesion: 82, resolve: 0, doctrineId: "rescue_standard" },
    { id: "bows", name: "Heronwick Bows", faction: "free_banners", role: "skirmish", hex: { q: 4, r: 7 }, strength: 64, cohesion: 70, resolve: 0, doctrineId: "bring_the_water" },

    // The barricade guard.
    { id: "sootbank_spears", name: "Sootbank Spears", faction: "ashen_host", role: "frontline", hex: { q: 4, r: 1 }, strength: 64, cohesion: 68, resolve: 1, doctrineId: "no_step_back" },
    { id: "tidebreak_reavers", name: "Tidebreak Reavers", faction: "ashen_host", role: "frontline", hex: { q: 2, r: 1 }, strength: 54, cohesion: 62, resolve: 0, doctrineId: "no_step_back" },
    // The marsh hunters, still in the reeds.
    { id: "mire_stalkers", name: "Mire Stalkers", faction: "ashen_host", role: "skirmish", hex: { q: 3, r: 4 }, strength: 46, cohesion: 60, resolve: 0, doctrineId: "terror_push" },
    { id: "gallowmere_pack", name: "Gallowmere Pack", faction: "ashen_host", role: "cavalry", hex: { q: 6, r: 3 }, strength: 44, cohesion: 60, resolve: 3, doctrineId: "lie_in_wait", renown: { title: "The Drowned Hounds" } },
    { id: "weirfen_hunters", name: "Weirfen Hunters", faction: "ashen_host", role: "frontline", hex: { q: 0, r: 3 }, strength: 52, cohesion: 62, resolve: 0, doctrineId: "lie_in_wait" },
  ],
  hostSchedule: [
    {
      phase: 1,
      intent: "The barricade guard stands to; somewhere in the reeds, the hunters let you come.",
      orders: {},
    },
    {
      phase: 2,
      intent: "Horns on both flanks: the Drowned Hounds and the Weirfen Hunters rise from the reeds, after whoever wavers.",
      orders: { gallowmere_pack: "cull_the_weak", weirfen_hunters: "cull_the_weak" },
    },
  ],
  winCondition: { kind: "breakObjective", objectiveId: "saltgate_barricade" },
  defeatConditions: [{ kind: "squadsLost", count: 3 }],
  timeoutOutcome: "defeat",
  forecast: { start: "clear", shiftChance: 0.25, shifts: ["clear", "mist"] },
  referencePlans: {
    // The assault and the lances march in step on the barricade; the standard keeps it
    // standing; the bows wait for a hunter to come on alone and strike it.
    intended: {
      van_west: "bring_the_water",
      van_centre: "bring_the_water",
      van_east: "bring_the_water",
      outriders: "bring_the_water",
      standard: "rescue_standard",
      bows: "bring_the_water",
    },
    // The intro's habit: wait for the enemy to come. It never does; the day runs out.
    bad: {
      van_west: "shield_the_line",
      van_centre: "shield_the_line",
      van_east: "shield_the_line",
      outriders: "clean_counterstroke",
      standard: "rescue_standard",
      bows: "clean_counterstroke",
    },
  },
};
