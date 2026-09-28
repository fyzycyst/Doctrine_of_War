// Battle 2: The Saltmarsh Column. In grey rain the Banners escort a refugee column
// south across a drowned marsh while Host hunters close in from the north, out of
// the mist and the reeds. Lesson: Fighting Withdrawal, kept steady by a Rescue
// Standard. Companies that stand and fight are surrounded and never reach the
// southern edge; companies that withdraw under pressure bring the column home.
import type { BoardHex, BoardLayout, TerrainType } from "../../board";
import type { EngineScenario } from "../types";

const WIDTH = 7;
const HEIGHT = 8;

// Two causeways run south through the marsh; reed banks give the hunters cover.
const causeways = new Set(["3,0", "3,1", "3,2", "3,3", "2,4", "2,5", "2,6", "2,7", "5,2", "5,3", "4,4", "4,5", "4,6", "4,7"]);
const reeds = new Set(["1,1", "5,0", "0,3", "6,3", "1,5", "5,6", "3,4"]);
const hummocks = new Set(["2,1", "4,1", "2,2", "4,2", "3,5", "3,6", "1,3", "5,4"]);

const labels: Record<string, string> = {
  "3,0": "Saltgate Causeway",
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
    ...(r >= 1 && r <= 3 && q >= 1 && q <= 5 ? { deploymentFaction: "free_banners" as const } : {}),
  };
}

const board: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

/** The southern edge: every hex of the last row. */
const southernEdge = Array.from({ length: WIDTH }, (_, q) => ({ q, r: HEIGHT - 1 }));

export const saltmarshColumn: EngineScenario = {
  id: "saltmarsh_column",
  title: "The Saltmarsh Column",
  briefing:
    "Three hundred souls and their carts must cross the saltmarsh before the Host's hunters find them in the rain. " +
    "Do not stand and die in the mud: give ground when they close, and keep the column's courage up. " +
    "Get the column and three companies off the southern edge.",
  playerFaction: "free_banners",
  initiativeSide: "ashen_host",
  maxPhases: 4,
  timeOfDay: "rainGrey",
  curatedSeed: 4,
  board,
  objectives: [],
  playerDoctrineIds: ["shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "hold_for_dawn"],
  squads: [
    { id: "saltmarsh_column", name: "The Saltmarsh Column", faction: "free_banners", role: "support", hex: { q: 3, r: 2 }, strength: 56, cohesion: 63, resolve: 0, doctrineId: "keep_the_column_moving", noncombatant: true },
    { id: "greyford_shields", name: "Greyford Shields", faction: "free_banners", role: "frontline", hex: { q: 3, r: 1 }, strength: 84, cohesion: 74, resolve: 1, doctrineId: "fighting_withdrawal" },
    { id: "dawnwatch_archers", name: "Dawnwatch Archers", faction: "free_banners", role: "skirmish", hex: { q: 2, r: 2 }, strength: 66, cohesion: 70, resolve: 1, doctrineId: "fighting_withdrawal" },
    { id: "mercy_standard", name: "Mercy Standard", faction: "free_banners", role: "support", hex: { q: 3, r: 3 }, strength: 52, cohesion: 80, resolve: 0, doctrineId: "rescue_standard" },
    { id: "stoneford_riders", name: "Stoneford Riders", faction: "free_banners", role: "cavalry", hex: { q: 4, r: 2 }, strength: 70, cohesion: 66, resolve: 0, doctrineId: "fighting_withdrawal" },
    { id: "kestrel_lancers", name: "Kestrel Lancers", faction: "free_banners", role: "cavalry", hex: { q: 2, r: 1 }, strength: 72, cohesion: 66, resolve: 0, doctrineId: "fighting_withdrawal" },
    { id: "mill_lane_guard", name: "Mill Lane Guard", faction: "free_banners", role: "frontline", hex: { q: 4, r: 1 }, strength: 76, cohesion: 70, resolve: 0, doctrineId: "fighting_withdrawal" },

    // The hunters: they come out of the reeds and the rain from the north and the flanks.
    { id: "mire_stalkers", name: "Mire Stalkers", faction: "ashen_host", role: "skirmish", hex: { q: 2, r: 0 }, strength: 44, cohesion: 62, resolve: 0, doctrineId: "cull_the_weak" },
    { id: "ash_harriers", name: "Ash Harriers", faction: "ashen_host", role: "cavalry", hex: { q: 0, r: 3 }, strength: 46, cohesion: 60, resolve: 0, doctrineId: "cull_the_weak" },
    { id: "weirfen_hunters", name: "Weirfen Hunters", faction: "ashen_host", role: "frontline", hex: { q: 1, r: 5 }, strength: 52, cohesion: 64, resolve: 1, doctrineId: "lie_in_wait" },
    { id: "gallowmere_pack", name: "Gallowmere Pack", faction: "ashen_host", role: "cavalry", hex: { q: 6, r: 3 }, strength: 42, cohesion: 60, resolve: 2, doctrineId: "lie_in_wait", renown: { title: "The Drowned Hounds" } },
    { id: "tidebreak_reavers", name: "Tidebreak Reavers", faction: "ashen_host", role: "frontline", hex: { q: 0, r: 1 }, strength: 54, cohesion: 64, resolve: 0, doctrineId: "lie_in_wait" },
  ],
  hostSchedule: [
    {
      phase: 1,
      intent: "Out of the northern reeds come the first hunters, riders among them.",
      orders: { mire_stalkers: "cull_the_weak", ash_harriers: "cull_the_weak", gallowmere_pack: "cull_the_weak", tidebreak_reavers: "lie_in_wait", weirfen_hunters: "lie_in_wait" },
    },
    {
      phase: 2,
      intent: "Horns in the rain: more hunters join the chase, and something rises from the mud ahead of the column.",
      orders: { tidebreak_reavers: "cull_the_weak", weirfen_hunters: "cull_the_weak" },
    },
    {
      phase: 3,
      intent: "The hunters close for the kill before the column reaches the stairs.",
      orders: { mire_stalkers: "terror_push", ash_harriers: "terror_push" },
    },
    { phase: 4, intent: "The last light fails. Whatever is still in the marsh is theirs.", orders: {} },
  ],
  winCondition: { kind: "escapeEdge", edgeHexes: southernEdge, count: 4, mustEscape: ["saltmarsh_column"] },
  defeatConditions: [{ kind: "squadsLost", count: 5 }],
  // If the column and all but one of the companies needed got out, the campaign still advances (a stalemate).
  timeoutOutcome: "stalemate",
  forecast: { start: "rain", shiftChance: 0.4, shifts: ["rain", "mist"] },
  referencePlans: {
    // Give ground under pressure; one standard keeps the column's courage.
    intended: {
      greyford_shields: "fighting_withdrawal",
      dawnwatch_archers: "fighting_withdrawal",
      mercy_standard: "rescue_standard",
      stoneford_riders: "fighting_withdrawal",
      kestrel_lancers: "fighting_withdrawal",
      mill_lane_guard: "fighting_withdrawal",
    },
    // Stand and fight: the hunters surround the line and the column never gets out.
    bad: {
      greyford_shields: "shield_the_line",
      dawnwatch_archers: "shield_the_line",
      mercy_standard: "shield_the_line",
      stoneford_riders: "shield_the_line",
      kestrel_lancers: "shield_the_line",
      mill_lane_guard: "shield_the_line",
    },
  },
};
