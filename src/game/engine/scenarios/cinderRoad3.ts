// Cinder Road, battle 3: Open a Road. Ember Ford by daylight, crossed the other way: the
// Banners hold the same east bank as on the night of the burning bridges, and now cross
// west for the Cinder Road. The Host holds the far bank and its road heads. Banner
// initiative, under fog. Lesson (the star is Open the Road, the Advance): there is no
// barricade to march on this time, only roads, and every commander's map shows them, so
// the column marches on the roads themselves (the exits) and cuts down whatever stands on
// them. Bring the Water, last battle's star, has nothing to march on and stands on the
// bank. But the fords cut both ways: the Host's reserve waits opposite the Mill Ford and
// wades over for the Mill Road behind us once we commit, as it did that night. A pure
// march leaves the road open; companies that stand fast on the Mill Road (Shield the Line)
// hold it. Registered in the First Call pack (packs/registry.ts), not in the intro's list.
import type { BoardHex, BoardLayout, TerrainType } from "../../board";
import type { EngineScenario } from "../types";

const WIDTH = 7;
const HEIGHT = 6;
const RIVER_Q = 4;

/** The far-bank roads: the Cinder Road and the Ashpit Lane fork off the west edge. */
export const FAR_BANK_ROADS = [
  { q: 0, r: 1 },
  { q: 0, r: 2 },
];
/** Our own roads behind us (the intro's exits): a Host company on one is through. */
export const NEAR_BANK_ROADS = [{ q: 6, r: 4 }];

// Ember Ford's ground, unchanged, with the far-bank road carried on to the west edge.
const special: Record<string, { terrain: TerrainType; label?: string }> = {
  "4,1": { terrain: "ford", label: "Cinder Ford" },
  "4,4": { terrain: "ford", label: "Mill Ford" },
  "5,2": { terrain: "ridge", label: "Watcher's Rise" },
  "1,0": { terrain: "ruin", label: "Burnt Chapel" },
  "5,5": { terrain: "ruin", label: "Tollhouse Ruin" },
  "6,0": { terrain: "ruin" },
  "1,1": { terrain: "road" },
  "0,1": { terrain: "road", label: "The Cinder Road" },
  "0,2": { terrain: "road", label: "Ashpit Lane" },
  "2,1": { terrain: "road" },
  "3,1": { terrain: "road" },
  "5,1": { terrain: "road" },
  "6,1": { terrain: "road", label: "Ferry Road" },
  "5,4": { terrain: "road" },
  "6,4": { terrain: "road", label: "Mill Road" },
};

function hexAt(q: number, r: number): BoardHex {
  const key = `${q},${r}`;
  const override = special[key];
  const terrain: TerrainType = override?.terrain ?? (q === RIVER_Q ? "river" : "field");
  return {
    coord: { q, r },
    terrain,
    ...(q === RIVER_Q && !override ? { label: "Emberwater" } : {}),
    ...(override?.label ? { label: override.label } : {}),
    ...(q <= 2 ? { deploymentFaction: "ashen_host" as const } : {}),
    ...(q >= 5 ? { deploymentFaction: "free_banners" as const } : {}),
  };
}

const board: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

export const cinderRoad3: EngineScenario = {
  id: "cinder_road_ember_ford",
  title: "Open a Road",
  briefing:
    "Ember Ford by daylight, and this time we cross. The bridges are cold stumps; the Host holds the far bank and stands on its road heads, and from the water we will not see its guard until we are on it. " +
    "There is no barricade to march on, only roads, and we know where they run: send the column and the standard over the Cinder Ford for the Cinder Road and the Ashpit Lane, and cut down whatever stands on them. Two companies on the roads opens the way. " +
    "But the fords cut both ways. The Host keeps a reserve opposite the Mill Ford, and once we commit it will wade over for the Mill Road behind us, as it did that night. " +
    "Leave the Mill Road to companies that stand fast.",
  playerFaction: "free_banners",
  initiativeSide: "free_banners",
  maxPhases: 7,
  timeOfDay: "day",
  // Fortune-on seed for the first playthrough and video capture: a clean win by daylight, no
  // company lost, the Mill Road guard breaking the Scorchmark Spears as they climb out.
  curatedSeed: 181,
  board,
  objectives: [],
  playerDoctrineIds: ["open_the_road", "bring_the_water", "shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke"],
  squads: [
    // The slots of the Cinder Road call (squad id = slot id), in activation order.
    { id: "ford_van", name: "Coldwater Shields", faction: "free_banners", role: "frontline", hex: { q: 5, r: 1 }, strength: 84, cohesion: 74, resolve: 1, doctrineId: "open_the_road" },
    { id: "road_van", name: "Ferrymoot Pikes", faction: "free_banners", role: "frontline", hex: { q: 6, r: 1 }, strength: 80, cohesion: 70, resolve: 0, doctrineId: "open_the_road" },
    { id: "chapel_van", name: "Thornwick Spears", faction: "free_banners", role: "frontline", hex: { q: 5, r: 0 }, strength: 76, cohesion: 68, resolve: 0, doctrineId: "open_the_road" },
    { id: "standard", name: "Wickmere Standard", faction: "free_banners", role: "support", hex: { q: 6, r: 0 }, strength: 52, cohesion: 82, resolve: 0, doctrineId: "open_the_road" },
    { id: "lances", name: "Sunward Lances", faction: "free_banners", role: "cavalry", hex: { q: 6, r: 4 }, strength: 72, cohesion: 66, resolve: 0, doctrineId: "shield_the_line" },
    { id: "bows", name: "Heronwick Bows", faction: "free_banners", role: "skirmish", hex: { q: 6, r: 3 }, strength: 64, cohesion: 70, resolve: 0, doctrineId: "shield_the_line" },

    // The road heads: the Host stands where the far-bank roads leave the ford's ground. The
    // Ashpit Wardens only bar the lane (Lie in Wait): a worn column must still get through.
    { id: "cinderwake_spears", name: "Cinderwake Spears", faction: "ashen_host", role: "frontline", hex: { q: 0, r: 1 }, strength: 34, cohesion: 46, resolve: 0, doctrineId: "no_step_back" },
    { id: "ashpit_wardens", name: "Ashpit Wardens", faction: "ashen_host", role: "frontline", hex: { q: 0, r: 2 }, strength: 30, cohesion: 44, resolve: 0, doctrineId: "lie_in_wait" },
    { id: "chapel_stalkers", name: "Chapel Stalkers", faction: "ashen_host", role: "skirmish", hex: { q: 1, r: 0 }, strength: 46, cohesion: 60, resolve: 0, doctrineId: "lie_in_wait" },
    // The reserve at the Mill Ford: it crosses at our back once we commit.
    { id: "scorchmark_spears", name: "Scorchmark Spears", faction: "ashen_host", role: "frontline", hex: { q: 3, r: 5 }, strength: 54, cohesion: 60, resolve: 1, doctrineId: "no_step_back" },
    { id: "kilnbrand_raiders", name: "Kilnbrand Raiders", faction: "ashen_host", role: "skirmish", hex: { q: 2, r: 5 }, strength: 46, cohesion: 60, resolve: 0, doctrineId: "no_step_back" },
  ],
  hostSchedule: [
    {
      phase: 1,
      intent: "The far bank stands to on its road heads; across the Mill Ford, the reserve waits for you to commit.",
      orders: {},
    },
    {
      phase: 2,
      intent: "Horns at the Mill Ford: the reserve wades in for the Mill Road behind you.",
      orders: { scorchmark_spears: "through_the_embers", kilnbrand_raiders: "through_the_embers" },
    },
    {
      phase: 3,
      intent: "The Burnt Chapel empties: its hunters fall on whoever wavers on the road.",
      orders: { chapel_stalkers: "cull_the_weak" },
    },
  ],
  winCondition: { kind: "escapeEdge", edgeHexes: FAR_BANK_ROADS, count: 2 },
  defeatConditions: [
    // One Host company on our own roads cuts the column off from the bank behind it.
    { kind: "enemyEscape", edgeHexes: NEAR_BANK_ROADS, count: 1 },
    { kind: "squadsLost", count: 4 },
  ],
  timeoutOutcome: "defeat",
  forecast: { start: "clear", shiftChance: 0.2, shifts: ["clear", "rain"] },
  referencePlans: {
    // The column and the standard march on the roads; the lances and the bows stand fast
    // on the Mill Road and the Mill Ford bank against the reserve.
    intended: {
      ford_van: "open_the_road",
      road_van: "open_the_road",
      chapel_van: "open_the_road",
      standard: "open_the_road",
      lances: "shield_the_line",
      bows: "shield_the_line",
    },
    // The strongest known alternative: the Mill Ford watch on Clean Counterstroke (the
    // intro's lesson on its own ground), striking the reserve as it climbs out. Diagnostic.
    alternative: {
      ford_van: "open_the_road",
      road_van: "open_the_road",
      chapel_van: "open_the_road",
      standard: "open_the_road",
      lances: "clean_counterstroke",
      bows: "clean_counterstroke",
    },
    // Last battle's star misapplied: Bring the Water marches on what the map shows, and
    // here the map shows no objective, only the roads. The column stands on the bank.
    bad: {
      ford_van: "bring_the_water",
      road_van: "bring_the_water",
      chapel_van: "bring_the_water",
      standard: "bring_the_water",
      lances: "bring_the_water",
      bows: "bring_the_water",
    },
  },
};
