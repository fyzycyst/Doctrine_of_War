// P4 offensive prototype (a test fixture, not shipped content; not in the scenario
// registry). The Banners have the initiative and must break the Host's wagon park on
// its own bank of the Emberwater (Cinder Road beat 2). Under fog the Banners see only
// about 2 hexes, so the attack cannot be aimed at enemies: it is anchored to the
// objective, which both sides know from the map. Lesson: Bring the Water marches the
// assault on the park; a Rescue Standard keeps it standing against the Kept Coal's
// dread and the thralls' charge. Every company on the march, standard included, is a
// storm without a standard: it breaks on the guard (the mono guardrail).
import type { BoardHex, BoardLayout, TerrainType } from "../../board";
import type { EngineScenario } from "../types";

const WIDTH = 8;
const HEIGHT = 5;
export const WAGON_PARK = { q: 6, r: 2 };

const special: Record<string, { terrain: TerrainType; label?: string }> = {
  "6,2": { terrain: "field", label: "The Wagon Park" },
  "3,1": { terrain: "road" },
  "4,1": { terrain: "road" },
  "5,1": { terrain: "road", label: "Cart Road" },
  "2,1": { terrain: "road" },
  "3,3": { terrain: "reeds" },
  "4,0": { terrain: "ruin", label: "Burnt Byre" },
  "7,4": { terrain: "reeds" },
};

function hexAt(q: number, r: number): BoardHex {
  const override = special[`${q},${r}`];
  return {
    coord: { q, r },
    terrain: override?.terrain ?? "field",
    ...(override?.label ? { label: override.label } : {}),
    ...(q === WAGON_PARK.q && r === WAGON_PARK.r ? { objectiveId: "wagon_park" } : {}),
    ...(q <= 1 ? { deploymentFaction: "free_banners" as const } : {}),
    ...(q >= 5 ? { deploymentFaction: "ashen_host" as const } : {}),
  };
}

const board: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

export const wagonPark: EngineScenario = {
  id: "proto_wagon_park",
  title: "The Wagon Park (prototype)",
  briefing:
    "The Host's wagons stand on its own bank, and every fire it lights is fed from them. " +
    "We cannot see its companies from here, but we know where the park is: march on it together and break it.",
  playerFaction: "free_banners",
  initiativeSide: "free_banners",
  maxPhases: 6,
  board,
  objectives: [
    {
      id: "wagon_park",
      name: "The Wagon Park",
      description: "Batter the wagon park down before the day is out.",
      hex: WAGON_PARK,
      integrity: 48,
      defender: "ashen_host",
    },
  ],
  playerDoctrineIds: [
    "bring_the_water",
    "shield_the_line",
    "fighting_withdrawal",
    "rescue_standard",
    "clean_counterstroke",
    "hold_for_dawn",
  ],
  squads: [
    { id: "greyford_shields", name: "Greyford Shields", faction: "free_banners", role: "frontline", hex: { q: 1, r: 1 }, strength: 84, cohesion: 72, resolve: 1, doctrineId: "shield_the_line" },
    { id: "mill_lane_guard", name: "Mill Lane Guard", faction: "free_banners", role: "frontline", hex: { q: 1, r: 2 }, strength: 78, cohesion: 70, resolve: 0, doctrineId: "shield_the_line" },
    { id: "reedmarsh_levy", name: "Reedmarsh Levy", faction: "free_banners", role: "frontline", hex: { q: 1, r: 3 }, strength: 72, cohesion: 64, resolve: 0, doctrineId: "shield_the_line" },
    { id: "lanternbearers", name: "Lanternbearers", faction: "free_banners", role: "support", hex: { q: 0, r: 2 }, strength: 54, cohesion: 80, resolve: 0, doctrineId: "rescue_standard" },
    { id: "stoneford_riders", name: "Stoneford Riders", faction: "free_banners", role: "cavalry", hex: { q: 0, r: 3 }, strength: 72, cohesion: 68, resolve: 1, doctrineId: "clean_counterstroke" },

    // The park guard: it stands beside the wagons and strikes whoever comes close. The
    // Kept Coal's dread is what the standard is for.
    { id: "slagwall_oathguard", name: "Slagwall Oathguard", faction: "ashen_host", role: "frontline", hex: { q: 5, r: 2 }, strength: 54, cohesion: 62, resolve: 3, doctrineId: "no_step_back", renown: { title: "The Kept Coal" } },
    { id: "ashbound_levies", name: "Ashbound Levies", faction: "ashen_host", role: "frontline", hex: { q: 6, r: 1 }, strength: 50, cohesion: 56, resolve: -1, doctrineId: "no_step_back" },
    // The sally: it runs screaming at whoever comes within 3 of the wagons.
    { id: "cindermaw_thralls", name: "Cindermaw Thralls", faction: "ashen_host", role: "frontline", hex: { q: 6, r: 3 }, strength: 50, cohesion: 54, resolve: -1, doctrineId: "terror_push" },
    { id: "soot_hounds", name: "Soot Hounds", faction: "ashen_host", role: "cavalry", hex: { q: 7, r: 4 }, strength: 42, cohesion: 60, resolve: 0, doctrineId: "lie_in_wait" },
  ],
  hostSchedule: [
    {
      phase: 1,
      intent: "The wagon guard stands to, and the thralls are loosed on whoever comes close.",
      orders: {},
    },
    {
      phase: 3,
      intent: "The hounds slip out of the reeds after the wounded.",
      orders: { soot_hounds: "cull_the_weak" },
    },
  ],
  winCondition: { kind: "breakObjective", objectiveId: "wagon_park" },
  defeatConditions: [{ kind: "squadsLost", count: 3 }],
  timeoutOutcome: "defeat",
  forecast: { start: "clear", shiftChance: 0.25, shifts: ["clear", "mist"] },
  referencePlans: {
    // The assault, riders included, marches on the park; the standard follows and keeps
    // it standing against the Kept Coal.
    intended: {
      greyford_shields: "bring_the_water",
      mill_lane_guard: "bring_the_water",
      reedmarsh_levy: "bring_the_water",
      lanternbearers: "rescue_standard",
      stoneford_riders: "bring_the_water",
    },
    // The defensive habit: the wall waits for an enemy that never comes to it.
    bad: {
      greyford_shields: "shield_the_line",
      mill_lane_guard: "shield_the_line",
      reedmarsh_levy: "shield_the_line",
      lanternbearers: "rescue_standard",
      stoneford_riders: "clean_counterstroke",
    },
  },
};

/** Engine prototypes: balanced and fog-tested like shipped battles, never offered to the player. */
export const prototypeScenarios: EngineScenario[] = [wagonPark];
