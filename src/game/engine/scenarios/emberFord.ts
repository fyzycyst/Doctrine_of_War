// Battle 1: Ember Ford. The Host forces a night crossing of a river lit by its own
// burning bridges. Lesson: Clean Counterstroke against overextension. Squads that
// wade across arrive alone and can be struck cleanly; charging the supported bank
// is reckless, and a line that only holds never breaks the vanguard in time.
import type { BoardHex, BoardLayout, TerrainType } from "../../board";
import type { EngineScenario } from "../types";

const WIDTH = 7;
const HEIGHT = 6;
const RIVER_Q = 3;

const special: Record<string, { terrain: TerrainType; label?: string }> = {
  "3,1": { terrain: "ford", label: "Cinder Ford" },
  "3,4": { terrain: "ford", label: "Mill Ford" },
  "5,2": { terrain: "ridge", label: "Watcher's Rise" },
  "1,0": { terrain: "ruin", label: "Burnt Chapel" },
  "4,5": { terrain: "ruin", label: "Tollhouse Ruin" },
  "6,0": { terrain: "ruin" },
  "1,1": { terrain: "road" },
  "2,1": { terrain: "road" },
  "4,1": { terrain: "road" },
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
    ...(q <= 1 ? { deploymentFaction: "ashen_host" as const } : {}),
    ...(q >= 5 ? { deploymentFaction: "free_banners" as const } : {}),
  };
}

const board: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

/** The two roads off the Banners' rear edge: Host companies that reach them are through the line. */
const roadExits = [
  { q: 6, r: 1 },
  { q: 6, r: 4 },
];

export const emberFord: EngineScenario = {
  id: "ember_ford",
  title: "Ember Ford",
  briefing:
    "The Host has fired its own bridges to light the crossing, and now it wades into the burning water. " +
    "Every company that climbs our bank climbs it alone: strike it there, before the next one reaches its side. " +
    "Keep one standard raised behind the line, for the Unquenched march with them.",
  playerFaction: "free_banners",
  initiativeSide: "ashen_host",
  maxPhases: 5,
  timeOfDay: "nightFires",
  // Fortune-on seed for the first playthrough and video capture: a clean win, no company broken.
  curatedSeed: 2,
  board,
  objectives: [],
  playerDoctrineIds: [
    "shield_the_line",
    "fighting_withdrawal",
    "rescue_standard",
    "clean_counterstroke",
    "hold_for_dawn",
  ],
  squads: [
    { id: "tollbridge_pikes", name: "Tollbridge Pikes", faction: "free_banners", role: "frontline", hex: { q: 6, r: 1 }, strength: 84, cohesion: 74, resolve: 1, doctrineId: "shield_the_line" },
    { id: "ashfen_bowmen", name: "Ashfen Bowmen", faction: "free_banners", role: "skirmish", hex: { q: 5, r: 2 }, strength: 64, cohesion: 68, resolve: 0, doctrineId: "clean_counterstroke" },
    { id: "kestrel_lancers", name: "Kestrel Lancers", faction: "free_banners", role: "cavalry", hex: { q: 5, r: 1 }, strength: 74, cohesion: 66, resolve: 0, doctrineId: "clean_counterstroke" },
    { id: "mill_lane_guard", name: "Mill Lane Guard", faction: "free_banners", role: "frontline", hex: { q: 5, r: 3 }, strength: 78, cohesion: 70, resolve: -1, doctrineId: "shield_the_line" },
    { id: "lanternbearers", name: "Lanternbearers", faction: "free_banners", role: "support", hex: { q: 6, r: 2 }, strength: 54, cohesion: 80, resolve: 0, doctrineId: "rescue_standard" },
    { id: "reedmarsh_levy", name: "Reedmarsh Levy", faction: "free_banners", role: "frontline", hex: { q: 6, r: 4 }, strength: 70, cohesion: 62, resolve: -1, doctrineId: "shield_the_line" },
    { id: "harrow_riders", name: "Harrow Riders", faction: "free_banners", role: "cavalry", hex: { q: 5, r: 4 }, strength: 66, cohesion: 64, resolve: 1, doctrineId: "clean_counterstroke" },

    // The crossing vanguard (the win condition's targets).
    { id: "pyre_sworn", name: "Pyre-Sworn", faction: "ashen_host", role: "frontline", hex: { q: 2, r: 1 }, strength: 78, cohesion: 72, resolve: 3, doctrineId: "through_the_embers", renown: { title: "The Unquenched" } },
    { id: "emberline_spears", name: "Emberline Spears", faction: "ashen_host", role: "frontline", hex: { q: 2, r: 4 }, strength: 72, cohesion: 66, resolve: 1, doctrineId: "through_the_embers" },
    { id: "ashbound_levies", name: "Ashbound Levies", faction: "ashen_host", role: "frontline", hex: { q: 2, r: 2 }, strength: 68, cohesion: 62, resolve: -1, doctrineId: "no_step_back" },
    // Outriders: they never fight, they run for the roads through any gap.
    { id: "cinderhook_raiders", name: "Cinderhook Raiders", faction: "ashen_host", role: "skirmish", hex: { q: 2, r: 0 }, strength: 60, cohesion: 64, resolve: 0, doctrineId: "no_step_back" },
    { id: "soot_hounds", name: "Soot Hounds", faction: "ashen_host", role: "cavalry", hex: { q: 1, r: 3 }, strength: 58, cohesion: 60, resolve: 0, doctrineId: "no_step_back" },
    // The near-bank guard keeps the fords supported.
    { id: "kiln_wardens", name: "Kiln Wardens", faction: "ashen_host", role: "frontline", hex: { q: 2, r: 3 }, strength: 66, cohesion: 64, resolve: 0, doctrineId: "no_step_back" },
  ],
  hostSchedule: [
    {
      phase: 1,
      intent: "The vanguard wades into the burning fords: the Pyre-Sworn lead.",
      orders: {
        pyre_sworn: "through_the_embers",
        emberline_spears: "through_the_embers",
        ashbound_levies: "through_the_embers",
        cinderhook_raiders: "no_step_back",
        soot_hounds: "no_step_back",
        kiln_wardens: "no_step_back",
      },
    },
    {
      phase: 2,
      intent: "The outriders slip into the water, looking for a gap the fighting leaves.",
      orders: { cinderhook_raiders: "slip_the_leash", soot_hounds: "slip_the_leash" },
    },
    {
      phase: 3,
      intent: "The Host presses every company it has across the river.",
      orders: {},
    },
    {
      phase: 4,
      intent: "Before the fires die, the near-bank guard throws itself into the water too.",
      orders: { kiln_wardens: "through_the_embers" },
    },
    {
      phase: 5,
      intent: "The bridges gutter out. Whatever is still on our bank must be broken before dark swallows it.",
      orders: {},
    },
  ],
  winCondition: {
    kind: "destroySquads",
    squadIds: ["pyre_sworn", "emberline_spears", "ashbound_levies"],
  },
  defeatConditions: [
    { kind: "enemyEscape", edgeHexes: roadExits, count: 2 },
    { kind: "squadsLost", count: 4 },
  ],
  // If the fires die with the vanguard still standing but nobody through, it is a stalemate.
  timeoutOutcome: "stalemate",
  // ...but only if at least one vanguard company was broken; otherwise it is a defeat.
  stalemateRequires: { minEnemyBroken: 1, targetsOnly: true },
  forecast: { start: "clear", shiftChance: 0.3, shifts: ["clear", "rain"] },
  referencePlans: {
    // Every company waits for a Host company to climb out alone, then strikes it;
    // the Lanternbearers keep them steady against the Unquenched.
    intended: {
      tollbridge_pikes: "clean_counterstroke",
      ashfen_bowmen: "clean_counterstroke",
      kestrel_lancers: "clean_counterstroke",
      mill_lane_guard: "clean_counterstroke",
      lanternbearers: "rescue_standard",
      reedmarsh_levy: "clean_counterstroke",
      harrow_riders: "clean_counterstroke",
    },
    // The tutorial's lesson misapplied: a wall that never strikes back runs out of night.
    bad: {
      tollbridge_pikes: "shield_the_line",
      ashfen_bowmen: "shield_the_line",
      kestrel_lancers: "shield_the_line",
      mill_lane_guard: "shield_the_line",
      lanternbearers: "shield_the_line",
      reedmarsh_levy: "shield_the_line",
      harrow_riders: "shield_the_line",
    },
  },
};
