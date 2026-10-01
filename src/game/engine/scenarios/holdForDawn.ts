// Battle 3, the finale: Hold for Dawn. The Host's full assault on the last wall of
// the hill fort, in the dark before dawn under an ash-laden wind. Through the night
// the Cinderram grinds at the front line under wet hides that nothing can pierce, and
// the Ash Mangonel lobs fire over the line at the gate: the shields (the wall) must hold
// and bite, and the standards must keep them standing. In the last hour of dark the
// hides are burnt through; at sunrise the Host's nerve fails and the exposed ram is the
// opportunists' to break. Lesson: the wall through the night, the opportunist at dawn.
// Losing three companies breaks the line, so a plan that brawls instead of bracing loses
// even if it wins the fight.
import type { BoardHex, BoardLayout, TerrainType } from "../../board";
import type { EngineScenario } from "../types";

const WIDTH = 9;
const HEIGHT = 8;
/** The last wall runs down the eastern edge; the Banners stand with their backs to it. */
const WALL_Q = 8;
const GATE = { q: 8, r: 3 };

const special: Record<string, { terrain: TerrainType; label?: string; objectiveId?: string }> = {
  "8,3": { terrain: "wall", label: "The Last Gate", objectiveId: "last_gate" },
  "4,1": { terrain: "ruin", label: "North Outwork" },
  "4,6": { terrain: "ruin", label: "South Outwork" },
  "1,0": { terrain: "ridge", label: "Ash Barrow" },
};

function hexAt(q: number, r: number): BoardHex {
  const override = special[`${q},${r}`];
  const terrain: TerrainType = override?.terrain ?? (q === WALL_Q ? "wall" : r === GATE.r ? "road" : "field");
  const label = override?.label ?? (q === WALL_Q ? "The Last Wall" : r === GATE.r && q === 0 ? "Cinder Road" : undefined);
  return {
    coord: { q, r },
    terrain,
    ...(label ? { label } : {}),
    ...(override?.objectiveId ? { objectiveId: override.objectiveId } : {}),
    ...(q >= 6 && q < WALL_Q ? { deploymentFaction: "free_banners" as const } : {}),
    ...(q <= 1 ? { deploymentFaction: "ashen_host" as const } : {}),
  };
}

const board: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

const BANNERS = "free_banners" as const;
const HOST = "ashen_host" as const;

export const holdForDawn: EngineScenario = {
  id: "hold_for_dawn",
  title: "Hold for Dawn",
  briefing:
    "This is the last wall. Everything the Host has left is coming at the Last Gate before the sun comes up, " +
    "behind the Cinderram under its wet hides, while their fire-pots fall on the gate itself. " +
    "Nothing we throw bites the ram until its hides burn through. Hold the line through the dark with shields, " +
    "keep every banner standing (lose three companies and the line breaks), and when the hides burn and the sun breaks their nerve, " +
    "let the counterstroke break the ram.",
  playerFaction: BANNERS,
  initiativeSide: HOST,
  maxPhases: 5,
  timeOfDay: "predawn",
  timeOfDayByPhase: { 5: "sunrise" },
  curatedSeed: 53,
  board,
  objectives: [
    { id: "last_gate", name: "The Last Gate", description: "Hold it until dawn.", hex: GATE, integrity: 100, defender: BANNERS },
  ],
  playerDoctrineIds: ["shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "hold_for_dawn"],
  squads: [
    { id: "greyford_shields", name: "Greyford Shields", faction: BANNERS, role: "frontline", hex: { q: 6, r: 2 }, strength: 86, cohesion: 76, resolve: 1, doctrineId: "shield_the_line" },
    { id: "gatewarden_spears", name: "Gatewarden Spears", faction: BANNERS, role: "frontline", hex: { q: 6, r: 3 }, strength: 82, cohesion: 74, resolve: 0, doctrineId: "shield_the_line" },
    { id: "mill_lane_guard", name: "Mill Lane Guard", faction: BANNERS, role: "frontline", hex: { q: 6, r: 1 }, strength: 78, cohesion: 70, resolve: 0, doctrineId: "shield_the_line" },
    { id: "reedmarsh_levy", name: "Reedmarsh Levy", faction: BANNERS, role: "frontline", hex: { q: 6, r: 4 }, strength: 72, cohesion: 66, resolve: 0, doctrineId: "shield_the_line" },
    { id: "dawnwatch_archers", name: "Dawnwatch Archers", faction: BANNERS, role: "skirmish", hex: { q: 6, r: 0 }, strength: 66, cohesion: 70, resolve: 1, doctrineId: "clean_counterstroke" },
    { id: "hillfort_slingers", name: "Hillfort Slingers", faction: BANNERS, role: "skirmish", hex: { q: 6, r: 5 }, strength: 62, cohesion: 66, resolve: 0, doctrineId: "clean_counterstroke" },
    { id: "mercy_standard", name: "Mercy Standard", faction: BANNERS, role: "support", hex: { q: 7, r: 2 }, strength: 54, cohesion: 80, resolve: 0, doctrineId: "rescue_standard" },
    { id: "lamplight_sisters", name: "Lamplight Sisters", faction: BANNERS, role: "support", hex: { q: 7, r: 4 }, strength: 50, cohesion: 82, resolve: 0, doctrineId: "rescue_standard" },
    { id: "stoneford_riders", name: "Stoneford Riders", faction: BANNERS, role: "cavalry", hex: { q: 7, r: 0 }, strength: 70, cohesion: 66, resolve: 0, doctrineId: "clean_counterstroke" },
    { id: "kestrel_lancers", name: "Kestrel Lancers", faction: BANNERS, role: "cavalry", hex: { q: 7, r: 6 }, strength: 72, cohesion: 66, resolve: 0, doctrineId: "clean_counterstroke" },
    { id: "dawnrider_lances", name: "Dawnrider Lances", faction: BANNERS, role: "cavalry", hex: { q: 7, r: 3 }, strength: 70, cohesion: 68, resolve: 0, doctrineId: "clean_counterstroke" },

    { id: "cinderram", name: "The Cinderram", faction: HOST, role: "siege", hex: { q: 1, r: 3 }, strength: 85, cohesion: 64, resolve: 2, doctrineId: "under_wet_hides" },
    { id: "ash_mangonel", name: "The Ash Mangonel", faction: HOST, role: "siege", hex: { q: 0, r: 5 }, strength: 75, cohesion: 60, resolve: 0, doctrineId: "hurl_fire" },
    { id: "kiln_born_oathguard", name: "Kiln-Born Oathguard", faction: HOST, role: "frontline", hex: { q: 0, r: 3 }, strength: 93, cohesion: 76, resolve: 3, doctrineId: "iron_tide", renown: { title: "The Last Cinder" } },
    { id: "ember_legion", name: "Ember Legion", faction: HOST, role: "frontline", hex: { q: 1, r: 2 }, strength: 87, cohesion: 66, resolve: 1, doctrineId: "iron_tide" },
    { id: "ashfall_spears", name: "Ashfall Spears", faction: HOST, role: "frontline", hex: { q: 1, r: 4 }, strength: 87, cohesion: 66, resolve: 1, doctrineId: "iron_tide" },
    { id: "cindermaw_thralls", name: "Cindermaw Thralls", faction: HOST, role: "frontline", hex: { q: 1, r: 1 }, strength: 83, cohesion: 58, resolve: -1, doctrineId: "terror_push" },
    { id: "soot_drummers", name: "Soot Drummers", faction: HOST, role: "frontline", hex: { q: 1, r: 5 }, strength: 81, cohesion: 60, resolve: -1, doctrineId: "terror_push" },
    { id: "pyre_skirmishers", name: "Pyre Skirmishers", faction: HOST, role: "skirmish", hex: { q: 1, r: 0 }, strength: 69, cohesion: 60, resolve: 0, doctrineId: "cull_the_weak" },
    { id: "gloam_riders", name: "Gloam Riders", faction: HOST, role: "cavalry", hex: { q: 1, r: 6 }, strength: 71, cohesion: 60, resolve: 0, doctrineId: "cull_the_weak" },
    { id: "cinder_wardens", name: "Cinder Wardens", faction: HOST, role: "frontline", hex: { q: 0, r: 2 }, strength: 83, cohesion: 64, resolve: 0, doctrineId: "iron_tide" },
    { id: "last_reserve", name: "The Last Reserve", faction: HOST, role: "frontline", hex: { q: 0, r: 4 }, strength: 83, cohesion: 64, resolve: 0, doctrineId: "iron_tide" },
  ],
  hostSchedule: [
    {
      phase: 1,
      intent: "Drums in the dark: a ram rolls up the Cinder Road under wet hides, the Host's front ranks around it.",
      orders: { cinder_wardens: "lie_in_wait", last_reserve: "lie_in_wait" },
    },
    {
      phase: 2,
      intent: "Fresh companies leave the barrow and join the tide; fire-pots begin to arc over the wall.",
      orders: { cinder_wardens: "iron_tide" },
    },
    {
      phase: 3,
      intent: "Hunters go looking for any banner that wavers, and the Host's reserve is thrown in.",
      orders: { ember_legion: "cull_the_weak", last_reserve: "iron_tide" },
    },
    {
      phase: 4,
      intent: "The last hour of dark: the ram's hides are burnt through, and everything the Host has left is thrown at the Last Gate.",
      orders: { cinderram: "break_the_gate", cindermaw_thralls: "iron_tide", soot_drummers: "iron_tide", pyre_skirmishers: "terror_push" },
    },
    {
      phase: 5,
      intent: "Sunrise. The Host's nerve fails: they fall back from the wall, all but the ram's crew.",
      orders: {
        cinderram: "break_the_gate",
        ash_mangonel: "the_nerve_fails",
        kiln_born_oathguard: "the_nerve_fails",
        ember_legion: "the_nerve_fails",
        ashfall_spears: "the_nerve_fails",
        cindermaw_thralls: "the_nerve_fails",
        soot_drummers: "the_nerve_fails",
        pyre_skirmishers: "the_nerve_fails",
        gloam_riders: "the_nerve_fails",
        cinder_wardens: "the_nerve_fails",
        last_reserve: "the_nerve_fails",
      },
    },
  ],
  winCondition: { kind: "holdThenBreak", objectiveId: "last_gate", dawnPhase: 5, squadIds: ["cinderram"] },
  defeatConditions: [{ kind: "squadsLost", count: 3 }],
  // Three companies broken: the line breaks and the gate with it.
  // Held until dawn but the Cinderram survived: the campaign ends, but not in triumph.
  timeoutOutcome: "stalemate",
  // ...but only if the Host was bled: at least five of its companies broken.
  stalemateRequires: { minEnemyBroken: 5 },
  forecast: { start: "ashWind", shiftChance: 0.35, shifts: ["ashWind", "clear", "mist"] },
  referencePlans: {
    // Shields on the gate, standards behind them, and every blade ready to strike.
    intended: {
      greyford_shields: "shield_the_line",
      gatewarden_spears: "shield_the_line",
      mill_lane_guard: "shield_the_line",
      reedmarsh_levy: "shield_the_line",
      dawnwatch_archers: "clean_counterstroke",
      hillfort_slingers: "clean_counterstroke",
      mercy_standard: "rescue_standard",
      lamplight_sisters: "rescue_standard",
      stoneford_riders: "clean_counterstroke",
      kestrel_lancers: "clean_counterstroke",
      dawnrider_lances: "clean_counterstroke",
    },
    // Give ground at the last wall: there is nowhere to go, and the line is cut down against it.
    bad: {
      greyford_shields: "fighting_withdrawal",
      gatewarden_spears: "fighting_withdrawal",
      mill_lane_guard: "fighting_withdrawal",
      reedmarsh_levy: "fighting_withdrawal",
      dawnwatch_archers: "fighting_withdrawal",
      hillfort_slingers: "fighting_withdrawal",
      mercy_standard: "fighting_withdrawal",
      lamplight_sisters: "fighting_withdrawal",
      stoneford_riders: "fighting_withdrawal",
      kestrel_lancers: "fighting_withdrawal",
      dawnrider_lances: "fighting_withdrawal",
    },
  },
};
