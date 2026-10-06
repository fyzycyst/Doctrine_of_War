// Cinder Road, battle 6, the finale: Break the Strongpoint. The Banners come back to Greyford
// Gate, where the intro began, and this time the Host holds it: the Kept Coal's main body, the
// sworn who carry live coals from the first kiln, stand before the gate. The whole army may
// take the field. Lesson (combined arms on the attack; the tutorial's three families turned
// round): the Advance breaks the gate, the banners carry the assault through the Kept Coal's
// dread and the sworn's blows, and the counterstroke cuts down the sallies from the works. A
// bare assault breaks on the gate; banners without a screen are cut down by the sallies.
// Registered in the First Call pack (packs/registry.ts), not in the intro's scenario list.
import type { BoardHex, BoardLayout, TerrainType } from "../../board";
import type { EngineScenario } from "../types";

const WIDTH = 9;
const HEIGHT = 8;
/** Greyford Wall runs down the eastern edge; the gate is in it, on the Gate Road. */
const WALL_Q = 8;
export const GREYFORD_GATE = { q: 8, r: 3 };
const ROAD_R = 3;

const special: Record<string, { terrain: TerrainType; label?: string }> = {
  // The Banners' bank of the Grey: First Breach's River Ford, crossed the other way.
  "0,2": { terrain: "ford", label: "River Ford" },
  "0,3": { terrain: "ford" },
  "2,0": { terrain: "ridge", label: "North Ridge" },
  "3,0": { terrain: "ridge" },
  // The Host's works before the wall: the sallies wait in them.
  "7,0": { terrain: "ruin", label: "Broken Watch" },
  "7,7": { terrain: "ruin", label: "South Works" },
  "6,3": { terrain: "road", label: "Siege Approach" },
  "8,3": { terrain: "wall", label: "Greyford Gate" },
};

function hexAt(q: number, r: number): BoardHex {
  const key = `${q},${r}`;
  const override = special[key];
  const terrain: TerrainType = override?.terrain ?? (q === WALL_Q ? "wall" : q === 0 ? "river" : r === ROAD_R ? "road" : "field");
  const label = override?.label ?? (q === WALL_Q ? "Greyford Wall" : q === 0 ? "The Grey" : r === ROAD_R && q === 1 ? "Gate Road" : undefined);
  return {
    coord: { q, r },
    terrain,
    ...(label ? { label } : {}),
    ...(key === "8,3" ? { objectiveId: "greyford_gate" } : {}),
    ...(q >= 1 && q <= 2 ? { deploymentFaction: "free_banners" as const } : {}),
    ...(q >= 5 && q < WALL_Q ? { deploymentFaction: "ashen_host" as const } : {}),
  };
}

const board: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  // A ford of the Grey by daylight: no burning bridge wrecks.
  fordDressing: "none",
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

const BANNERS = "free_banners" as const;
const HOST = "ashen_host" as const;
const BTW = "bring_the_water";

export const cinderRoad6: EngineScenario = {
  id: "cinder_road_greyford_gate",
  title: "Break the Strongpoint",
  briefing:
    "We are back where it began: Greyford Gate. This time the Host holds it, and the Kept Coal stand before it, " +
    "the sworn who carry coals from the first kiln. Every company that first sees them will feel it. " +
    "Bring the whole army. Break the gate, keep the banners up with the assault, and cut down whatever comes out of the works at it. " +
    "Lose three companies and the attack breaks.",
  playerFaction: BANNERS,
  initiativeSide: BANNERS,
  maxPhases: 9,
  timeOfDay: "day",
  // The Kept Coal's coals smoke on the wind: ash-wind all day (dread from the Host x1.5).
  forecast: { start: "ashWind", shiftChance: 0, shifts: ["ashWind"] },
  curatedSeed: 1,
  board,
  objectives: [
    {
      id: "greyford_gate",
      name: "Greyford Gate",
      description: "The Host holds our gate. Break it.",
      hex: GREYFORD_GATE,
      integrity: 12,
      defender: HOST,
    },
  ],
  playerDoctrineIds: ["bring_the_water", "shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "hold_for_dawn"],
  squads: [
    // The posts of the Cinder Road call (squad id = slot id): the whole army.
    // Authored at fame 16, the recovery ("rough") force's, not the curated path's 30: the
    // Roll's threat then never eases the Host (the sworn's Resolve stays 3 on every call, as
    // the lore has it: they do not waver) and hardens it for a famous army (+2 strength a
    // fame point, capped at +12). The Roll replaces these with the companies it fields.
    { id: "north_van", name: "Coldwater Shields", faction: BANNERS, role: "frontline", hex: { q: 2, r: 2 }, strength: 84, cohesion: 74, resolve: 3, doctrineId: BTW },
    { id: "gate_van", name: "Ferrymoot Pikes", faction: BANNERS, role: "frontline", hex: { q: 1, r: 3 }, strength: 80, cohesion: 70, resolve: 3, doctrineId: BTW },
    { id: "road_van", name: "Sedgewick Levy", faction: BANNERS, role: "frontline", hex: { q: 1, r: 4 }, strength: 72, cohesion: 64, resolve: 3, doctrineId: BTW },
    { id: "south_van", name: "Thornwick Spears", faction: BANNERS, role: "frontline", hex: { q: 2, r: 5 }, strength: 76, cohesion: 68, resolve: 1, doctrineId: BTW },
    { id: "standard", name: "Wickmere Standard", faction: BANNERS, role: "support", hex: { q: 2, r: 3 }, strength: 52, cohesion: 82, resolve: 3, doctrineId: "rescue_standard" },
    { id: "bows", name: "Morningwall Slingers", faction: BANNERS, role: "skirmish", hex: { q: 2, r: 4 }, strength: 62, cohesion: 68, resolve: 0, doctrineId: "rescue_standard" },
    { id: "lances", name: "Brightcrag Riders", faction: BANNERS, role: "cavalry", hex: { q: 1, r: 1 }, strength: 68, cohesion: 64, resolve: 0, doctrineId: BTW },
    { id: "riders", name: "Sunward Lances", faction: BANNERS, role: "cavalry", hex: { q: 1, r: 6 }, strength: 72, cohesion: 66, resolve: 2, doctrineId: BTW },
    { id: "slingers", name: "Heronwick Bows", faction: BANNERS, role: "skirmish", hex: { q: 2, r: 6 }, strength: 64, cohesion: 70, resolve: 2, doctrineId: BTW },

    // The gate: the Kept Coal's main body and the sworn beside it, all of them sworn (Resolve 3).
    { id: "slagwall_oathguard", name: "Slagwall Oathguard", faction: HOST, role: "frontline", hex: { q: 7, r: 2 }, strength: 38, cohesion: 76, resolve: 3, doctrineId: "no_step_back", renown: { title: "The Kept Coal" } },
    { id: "kilnborn_oathguard", name: "Kiln-Born Oathguard", faction: HOST, role: "frontline", hex: { q: 7, r: 5 }, strength: 28, cohesion: 66, resolve: 3, doctrineId: "no_step_back" },
    // The wall-guards at the foot of Greyford Wall.
    { id: "north_wardens", name: "Coalward North", faction: HOST, role: "frontline", hex: { q: 7, r: 1 }, strength: 14, cohesion: 56, resolve: 3, doctrineId: "no_step_back" },
    { id: "south_wardens", name: "Coalward South", faction: HOST, role: "frontline", hex: { q: 7, r: 6 }, strength: 14, cohesion: 56, resolve: 3, doctrineId: "no_step_back" },
    // The sworn line before the gate: the assault must break it, then the gate.
    { id: "gate_ward", name: "Coal-Bearers", faction: HOST, role: "frontline", hex: { q: 6, r: 3 }, strength: 14, cohesion: 60, resolve: 3, doctrineId: "no_step_back" },
    { id: "coal_bearers", name: "Kiln Sworn", faction: HOST, role: "frontline", hex: { q: 6, r: 4 }, strength: 14, cohesion: 60, resolve: 3, doctrineId: "no_step_back" },
    // The sallies: out of the works at whoever reaches the wall.
    { id: "pyre_sworn", name: "Pyre-Sworn", faction: HOST, role: "frontline", hex: { q: 7, r: 0 }, strength: 24, cohesion: 60, resolve: 3, doctrineId: "terror_push" },
    { id: "cindermaw_thralls", name: "Cinder-Born", faction: HOST, role: "frontline", hex: { q: 7, r: 7 }, strength: 20, cohesion: 54, resolve: 3, doctrineId: "terror_push" },
    // The hunters: they lie in the flank works, then go for whatever is weakest (the banners).
    { id: "ember_hunters", name: "Ember Hunters", faction: HOST, role: "skirmish", hex: { q: 5, r: 0 }, strength: 18, cohesion: 58, resolve: 3, doctrineId: "lie_in_wait" },
    { id: "ash_harriers", name: "Ash Harriers", faction: HOST, role: "skirmish", hex: { q: 5, r: 7 }, strength: 18, cohesion: 58, resolve: 3, doctrineId: "lie_in_wait" },
  ],
  hostSchedule: [
    { phase: 1, intent: "The Kept Coal stand before Greyford Gate with the first kiln's coals; the sworn wait in the works.", orders: {} },
    { phase: 2, intent: "The works empty at whoever reaches the wall.", orders: {} },
    { phase: 3, intent: "The hunters slip out of the flank works and go for the banners.", orders: { ember_hunters: "cull_the_weak", ash_harriers: "cull_the_weak" } },
    { phase: 4, intent: "No step back: the sworn hold the gate while the coals still burn.", orders: {} },
    { phase: 5, intent: "The day is going.", orders: {} },
    { phase: 6, intent: "The coals still burn.", orders: {} },
    { phase: 7, intent: "The sun is on Greyford Wall.", orders: {} },
    { phase: 8, intent: "The light goes.", orders: {} },
    { phase: 9, intent: "Whatever still stands at nightfall, the Host keeps.", orders: {} },
  ],
  winCondition: { kind: "breakObjective", objectiveId: "greyford_gate" },
  defeatConditions: [{ kind: "squadsLost", count: 3 }],
  timeoutOutcome: "defeat",
  referencePlans: {
    // The march breaks the gate; two banners carry it through the dread and the sworn's blows.
    intended: {
      north_van: BTW,
      gate_van: BTW,
      road_van: BTW,
      south_van: BTW,
      standard: "rescue_standard",
      bows: "rescue_standard",
      lances: BTW,
      riders: BTW,
      slingers: BTW,
    },
    // The bare assault: everyone at the gate.
    bad: {
      north_van: BTW,
      gate_van: BTW,
      road_van: BTW,
      south_van: BTW,
      standard: BTW,
      bows: BTW,
      lances: BTW,
      riders: BTW,
      slingers: BTW,
    },
  },
};
