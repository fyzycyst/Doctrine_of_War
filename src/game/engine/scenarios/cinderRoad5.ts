// Cinder Road battle 4 (the pursuit, CR5): Cut the Retreat. The Host broke on the far-bank
// roads at Ember Ford, and what is left of it streams back down the Gate Road to Greyford
// Gate, where the Kept Coal will take it in: every company that reaches the gate is one more
// on the wall tomorrow (battle 5). The Banners' light companies rode round in the night and
// lie in the folds of ground on either side of the road ahead; the foot come over the River
// Ford behind, where the Host's rearguard holds the crossing. Lesson ("strike, don't block",
// the inverse of Open a Road's guard): a company that only stands beside the road slows a
// fleeing company and lets it pass; only a company that strikes what runs past cuts it down.
// One counted role, the hunt, under the pursuit exception (docs/CAMPAIGN.md). Escape is a
// rule (enemyEscape), not attrition. Ground: the shared Greyford Gate board (engine #2).
import type { EngineScenario } from "../types";
import { greyfordGateBoard } from "./greyfordGate.board";

/** The gate's two standable approaches: a Host company that reaches one is taken in. */
export const GATE_APPROACH = [
  { q: 7, r: 3 },
  { q: 7, r: 4 },
];

// The Banners at the River Ford and on the flank edges ahead (the light companies rode round
// in the night); the Host fleeing mid-board. The gate is not an objective here: nothing marches
// on it in a pursuit (Bring the Water would otherwise make for it).
const board = greyfordGateBoard({
  gateObjective: false,
  bannerZone: ({ q, r }) => q === 1 || (q === 0 && (r === 2 || r === 3)) || (q === 2 && r === 2) || (q >= 4 && q <= 7 && (r === 0 || r === 7)),
  hostZone: ({ q, r }) => q >= 2 && q <= 7 && r >= 1 && r <= 6 && !(q === 2 && r === 2),
});

/** The hunt's posts: the light companies lying on either side of the road ahead. */
export const HUNT_POSTS = ["lances", "riders", "bows"];
/** The foot: over the River Ford behind the column, facing the rearguard. Not a counted role. */
export const FOOT_POSTS = ["north_van", "road_van", "south_van"];
/** The fleeing column: break three before three reach the gate. */
export const COLUMN = ["cinderwake_spears", "ashpit_wardens", "furnace_pikes", "slag_bearers", "kilnbrand_raiders"];

const CC = "clean_counterstroke";
const STL = "shield_the_line";

export const cinderRoad5: EngineScenario = {
  id: "cinder_road_gate_road",
  title: "Cut the Retreat",
  briefing:
    "The Host broke on the roads at Ember Ford, and what is left of it is running down the Gate Road for Greyford Gate. Every company that gets inside will be on the wall when we come for it. " +
    "Our riders went round in the night and lie in the folds of ground on either side of the road ahead. The foot come over the River Ford behind them, where the Host's rearguard holds the crossing. " +
    "Do not block the road: a company that only stands beside it lets them by. Strike what runs past. Break three of them before three reach the gate.",
  playerFaction: "free_banners",
  initiativeSide: "free_banners",
  maxPhases: 5,
  timeOfDay: "day",
  // Fortune-on seed for the first playthrough and video capture: a clean win, no company lost,
  // nobody worn (tuning range; on the curated path the hunters break three in phase 1).
  curatedSeed: 1,
  board,
  objectives: [],
  playerDoctrineIds: [STL, "fighting_withdrawal", "rescue_standard", CC, "hold_for_dawn", "bring_the_water", "open_the_road"],
  squads: [
    // The slots of the Cinder Road call (squad id = slot id), in activation order.
    // The hunt: in the folds of ground on either side of the road ahead.
    { id: "lances", name: "Sunward Lances", faction: "free_banners", role: "cavalry", hex: { q: 5, r: 0 }, strength: 72, cohesion: 66, resolve: 0, doctrineId: CC },
    { id: "riders", name: "Brightcrag Riders", faction: "free_banners", role: "cavalry", hex: { q: 5, r: 7 }, strength: 68, cohesion: 64, resolve: 0, doctrineId: CC },
    { id: "bows", name: "Heronwick Bows", faction: "free_banners", role: "skirmish", hex: { q: 4, r: 7 }, strength: 64, cohesion: 70, resolve: 0, doctrineId: CC },
    // The foot, over the River Ford behind the column.
    { id: "north_van", name: "Coldwater Shields", faction: "free_banners", role: "frontline", hex: { q: 2, r: 2 }, strength: 84, cohesion: 74, resolve: 1, doctrineId: STL },
    { id: "road_van", name: "Ferrymoot Pikes", faction: "free_banners", role: "frontline", hex: { q: 1, r: 3 }, strength: 80, cohesion: 70, resolve: 0, doctrineId: STL },
    { id: "south_van", name: "Thornwick Spears", faction: "free_banners", role: "frontline", hex: { q: 1, r: 4 }, strength: 76, cohesion: 68, resolve: 0, doctrineId: STL },

    // The rearguard at the River Ford: it holds the crossing while the column runs (texture:
    // it never leaves the ford, and the battle is won or lost on the road).
    { id: "ember_guard", name: "Ember Guard", faction: "ashen_host", role: "frontline", hex: { q: 2, r: 3 }, strength: 60, cohesion: 64, resolve: 0, doctrineId: "no_step_back" },
    { id: "chapel_stalkers", name: "Chapel Stalkers", faction: "ashen_host", role: "skirmish", hex: { q: 2, r: 4 }, strength: 56, cohesion: 64, resolve: 0, doctrineId: "no_step_back" },
    // The column: Open a Road's survivors and the companies that came up behind them, broken
    // and running for the gate (Slip the Leash: they never stop to fight).
    { id: "cinderwake_spears", name: "Cinderwake Spears", faction: "ashen_host", role: "frontline", hex: { q: 3, r: 1 }, strength: 44, cohesion: 27, resolve: 0, doctrineId: "slip_the_leash" },
    { id: "ashpit_wardens", name: "Ashpit Wardens", faction: "ashen_host", role: "frontline", hex: { q: 3, r: 2 }, strength: 40, cohesion: 27, resolve: 0, doctrineId: "slip_the_leash" },
    { id: "furnace_pikes", name: "Furnace Pikes", faction: "ashen_host", role: "frontline", hex: { q: 3, r: 4 }, strength: 48, cohesion: 27, resolve: 0, doctrineId: "slip_the_leash" },
    { id: "slag_bearers", name: "Slag Bearers", faction: "ashen_host", role: "frontline", hex: { q: 3, r: 5 }, strength: 44, cohesion: 27, resolve: 0, doctrineId: "slip_the_leash" },
    { id: "kilnbrand_raiders", name: "Kilnbrand Raiders", faction: "ashen_host", role: "skirmish", hex: { q: 2, r: 6 }, strength: 38, cohesion: 27, resolve: 0, doctrineId: "slip_the_leash" },
  ],
  hostSchedule: [{ phase: 1, intent: "The Host streams back down the Gate Road for Greyford Gate; its rearguard holds the River Ford.", orders: {} }],
  winCondition: { kind: "destroySquads", squadIds: COLUMN, count: 3 },
  defeatConditions: [
    // Three companies inside the gate: the retreat is made good.
    { kind: "enemyEscape", edgeHexes: GATE_APPROACH, count: 3 },
    { kind: "squadsLost", count: 3 },
  ],
  timeoutOutcome: "defeat",
  forecast: { start: "clear", shiftChance: 0, shifts: ["clear"] },
  referencePlans: {
    // The riders strike what runs past (Clean Counterstroke: they wait, then charge a company
    // that has fallen out of the column); the foot hold the ford's bank against the rearguard.
    intended: { lances: CC, riders: CC, bows: CC, north_van: STL, road_van: STL, south_van: STL },
    // The strongest known alternative: the riders on Bring the Water (they strike whatever
    // comes beside them, with nothing to march on). Diagnostic.
    alternative: { lances: "bring_the_water", riders: "bring_the_water", bows: "bring_the_water", north_van: STL, road_van: STL, south_van: STL },
    // Open a Road's guard misapplied: stand fast beside the road, and let them by.
    bad: { lances: STL, riders: STL, bows: STL, north_van: STL, road_van: STL, south_van: STL },
  },
};
