// Cinder Road, battle 2: Strike the Wagon Park. Upstream of Ember Ford the Host keeps its
// wagons on its own (west) bank of the Emberwater: the coals, pitch and fire-pots every
// burning is fed from, escorted by a detachment of the Kept Coal with coals from the first
// kiln. The Banners cross at the shallows and break the park, by daylight, with the
// initiative, under fog: they cannot see the guard, but the park is on every map.
// The Host answers in kind: a kiln-clan ram crosses at the Sallow Weir to break the
// Covenant's sluice-house on our bank, which stands in its own race of water with one dry
// walk to it. Lesson (the star is Bring the Water; the second role is the sluice guard):
// break theirs before they break ours. A pure march, however strong, leaves the Sluice
// Walk open and the ram breaks the sluice in two blows. The guard is a role, defined by what
// it does: a company holds the walk when the ram comes up, or fights the ram before it
// strikes the sluice. Accepted fillers (docs/CAMPAIGN.md): Hold for Dawn takes its stand on
// the walk (intended); Clean Counterstroke waits and strikes the ram when it comes up alone
// (roster-dependent); any holding doctrine the player musters onto the walk
// (muster-dependent). The standard carries a banner with the assault (Rescue Standard, an extra).
// Registered in the First Call pack (packs/registry.ts), not in the intro's scenario list.
import type { BoardHex, BoardLayout, TerrainType } from "../../board";
import type { EngineScenario } from "../types";

const WIDTH = 8;
const HEIGHT = 8;
const RIVER_Q = 4;
export const WAGON_PARK = { q: 1, r: 6 };
/** The Covenant's sluice-house, standing in the water on the Banners' bank. */
export const WEIR_SLUICE = { q: 7, r: 0 };
/** The only dry way to the sluice: whoever holds it keeps the sluice. */
export const SLUICE_WALK = { q: 6, r: 1 };

const special: Record<string, { terrain: TerrainType; label?: string }> = {
  "4,0": { terrain: "ford", label: "Sallow Weir" },
  // Below the Wainford the river runs shallow: the assault's crossing.
  "4,4": { terrain: "ford", label: "The Shallows" },
  "4,5": { terrain: "ford", label: "Wainford" },
  "4,6": { terrain: "ford", label: "The Shallows" },
  "4,7": { terrain: "ford", label: "Low Ford" },
  "1,6": { terrain: "field", label: "The Wagon Park" },
  // The sluice-house spans the race (render: objectiveKind "sluice" on a water hex).
  "7,0": { terrain: "river", label: "The Weir Sluice" },
  // The sluice stands in its own race of water; one walk reaches it.
  "6,0": { terrain: "river", label: "Sluice Race" },
  "7,1": { terrain: "river", label: "Sluice Race" },
  "6,1": { terrain: "road", label: "Sluice Walk" },
  "6,2": { terrain: "road" },
  "6,3": { terrain: "road", label: "Weir Road" },
  "5,4": { terrain: "road" },
  // The Host's bank: the wagon track down to the Wainford, a burnt mill, sedge.
  "3,5": { terrain: "road" },
  "2,6": { terrain: "road", label: "Wagon Track" },
  "0,2": { terrain: "ruin", label: "Burnt Mill" },
  "0,7": { terrain: "reeds", label: "Sedge Bank" },
  "2,0": { terrain: "reeds" },
  "7,6": { terrain: "ridge", label: "Willow Rise" },
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
    ...(key === "1,6" ? { objectiveId: "wagon_park", objectiveKind: "wagons" as const } : {}),
    ...(key === "7,0" ? { objectiveId: "weir_sluice", objectiveKind: "sluice" as const } : {}),
    ...(q >= 5 && r >= 2 && terrain !== "river" ? { deploymentFaction: "free_banners" as const } : {}),
    ...(q <= 3 ? { deploymentFaction: "ashen_host" as const } : {}),
  };
}

const board: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  // Weir and shallows by daylight: no burning bridge wrecks at the fords.
  fordDressing: "none",
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

export const cinderRoad2: EngineScenario = {
  id: "cinder_road_wagon_park",
  title: "Strike the Wagon Park",
  briefing:
    "Upstream of Ember Ford the Host keeps its wagons on its own bank: the coals and fire-pots every burning is fed from, " +
    "escorted by a detachment of the Kept Coal, who carry coals from the first kiln. " +
    "We cannot see its companies across the water, but the park is on every map: cross at the shallows and march on it together. " +
    "The Host will answer in kind. A kiln-clan ram is coming down to the Sallow Weir for the Covenant's sluice-house on our bank, " +
    "and one dry walk leads to it. Someone must keep the Sluice Walk while the rest strike the park.",
  playerFaction: "free_banners",
  initiativeSide: "free_banners",
  maxPhases: 6,
  timeOfDay: "day",
  curatedSeed: 64,
  board,
  objectives: [
    {
      id: "wagon_park",
      name: "The Wagon Park",
      description: "Stave the casks, overturn the carts and drown the fire-pots before the day is out.",
      hex: WAGON_PARK,
      integrity: 56,
      defender: "ashen_host",
    },
    {
      id: "weir_sluice",
      name: "The Weir Sluice",
      description: "The Covenant's sluice-house on our bank: keep it standing.",
      hex: WEIR_SLUICE,
      integrity: 32,
      defender: "free_banners",
    },
  ],
  playerDoctrineIds: ["bring_the_water", "shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "hold_for_dawn"],
  squads: [
    // The posts of the Cinder Road call (squad id = slot id), in activation order.
    // Authored as the army stands after battle 1 on the curated path (its recommended
    // force), so that path meets the Host's threat at 0.
    { id: "ford_van", name: "Coldwater Shields", faction: "free_banners", role: "frontline", hex: { q: 5, r: 5 }, strength: 84, cohesion: 74, resolve: 2, doctrineId: "bring_the_water" },
    { id: "track_van", name: "Ferrymoot Pikes", faction: "free_banners", role: "frontline", hex: { q: 5, r: 6 }, strength: 80, cohesion: 70, resolve: 1, doctrineId: "bring_the_water" },
    { id: "sedge_van", name: "Sedgewick Levy", faction: "free_banners", role: "frontline", hex: { q: 5, r: 7 }, strength: 72, cohesion: 64, resolve: 1, doctrineId: "bring_the_water" },
    { id: "lances", name: "Sunward Lances", faction: "free_banners", role: "cavalry", hex: { q: 6, r: 5 }, strength: 72, cohesion: 66, resolve: 1, doctrineId: "bring_the_water" },
    { id: "standard", name: "Wickmere Standard", faction: "free_banners", role: "support", hex: { q: 6, r: 6 }, strength: 52, cohesion: 82, resolve: 1, doctrineId: "rescue_standard" },
    // The sluice keepers: posted on the Weir Road, two steps below the Sluice Walk.
    { id: "keepers", name: "Heronwick Bows", faction: "free_banners", role: "skirmish", hex: { q: 6, r: 3 }, strength: 64, cohesion: 70, resolve: 1, doctrineId: "hold_for_dawn" },

    // The park guard: a detachment of the Kept Coal stands by the wagons.
    { id: "slagwall_oathguard", name: "Slagwall Oathguard", faction: "ashen_host", role: "frontline", hex: { q: 2, r: 5 }, strength: 54, cohesion: 62, resolve: 3, doctrineId: "no_step_back", renown: { title: "The Kept Coal" } },
    { id: "ashbound_levies", name: "Ashbound Levies", faction: "ashen_host", role: "frontline", hex: { q: 1, r: 5 }, strength: 50, cohesion: 56, resolve: -1, doctrineId: "no_step_back" },
    // The sally: thralls run screaming at whoever comes within 3 of the wagons.
    { id: "cindermaw_thralls", name: "Cindermaw Thralls", faction: "ashen_host", role: "frontline", hex: { q: 3, r: 6 }, strength: 50, cohesion: 54, resolve: -1, doctrineId: "terror_push" },
    // The raid: across the Sallow Weir for the sluice.
    // The ram's escort: it falls on whoever comes within reach.
    { id: "cinderhook_raiders", name: "Cinderhook Raiders", faction: "ashen_host", role: "skirmish", hex: { q: 1, r: 0 }, strength: 46, cohesion: 62, resolve: 0, doctrineId: "iron_tide" },
    // A kiln-clan ram crew: steady while the engine stands, and it breaks stone in two blows.
    { id: "kiln_ram", name: "Kiln Ram", faction: "ashen_host", role: "siege", hex: { q: 2, r: 0 }, strength: 60, cohesion: 60, resolve: 1, doctrineId: "break_the_gate" },
  ],
  // The Host's intent for each phase: the Chronicle's phase titles.
  hostSchedule: [
    { phase: 1, intent: "The Kept Coal stand to by the wagons with the first kiln's coals; upstream a kiln-clan ram and its escort make for the Sallow Weir.", orders: {} },
    { phase: 2, intent: "The ram is at the weir, making for the Covenant's sluice; its escort falls on whoever comes within reach.", orders: {} },
    { phase: 3, intent: "The thralls throw themselves at whoever reaches their bank.", orders: {} },
    { phase: 4, intent: "The Kept Coal close about the wagons: no step back while the coals still burn.", orders: {} },
    { phase: 5, intent: "The day is going. Whatever still stands at sunset, the Host keeps.", orders: {} },
    { phase: 6, intent: "The last light on the water.", orders: {} },
  ],
  winCondition: { kind: "breakObjective", objectiveId: "wagon_park" },
  defeatConditions: [
    { kind: "objectiveLost", objectiveId: "weir_sluice" },
    { kind: "squadsLost", count: 3 },
  ],
  timeoutOutcome: "defeat",
  forecast: { start: "clear", shiftChance: 0.25, shifts: ["clear", "rain"] },
  referencePlans: {
    // March on the park; the keepers guard the sluice (Hold for Dawn); the standard carries
    // a banner with the assault (Rescue Standard: an extra, not a counted family).
    intended: {
      ford_van: "bring_the_water",
      track_van: "bring_the_water",
      sedge_van: "bring_the_water",
      lances: "bring_the_water",
      standard: "rescue_standard",
      keepers: "hold_for_dawn",
    },
    // The fixed-order accepted alternative for the keepers' post (tracked, never gated):
    // Clean Counterstroke waits and strikes the ram when it comes up the walk alone.
    alternative: {
      ford_van: "bring_the_water",
      track_van: "bring_the_water",
      sedge_van: "bring_the_water",
      lances: "bring_the_water",
      standard: "rescue_standard",
      keepers: "clean_counterstroke",
    },
    // The pure march: everyone on the park, the sluice left bare.
    bad: {
      ford_van: "bring_the_water",
      track_van: "bring_the_water",
      sedge_van: "bring_the_water",
      lances: "bring_the_water",
      standard: "bring_the_water",
      keepers: "bring_the_water",
    },
  },
};
