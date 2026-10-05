import type { BoardHex, BoardLayout, TerrainType } from "../../game/board";
import type { DioramaSquad } from "../figures/types";

/**
 * Lab board for M2's battle 2 until engine #2's board lands: two objectives on
 * one board. The Host's wagon park (east) and the Banners' sluice-house at the
 * weir, in the channel on the Banners' side (west). Render-only fixture: no
 * rules, no scenario.
 */
export const LAB_WAGON_PARK = { q: 6, r: 2 };
export const LAB_SLUICE = { q: 2, r: 2 };

const WIDTH = 8;
const HEIGHT = 5;
const special: Record<string, { terrain: TerrainType; label?: string }> = {
  "3,1": { terrain: "road" },
  "4,1": { terrain: "road" },
  "5,1": { terrain: "road" },
  "5,2": { terrain: "road" },
  "4,4": { terrain: "reeds" },
  "7,0": { terrain: "ruin" },
  "1,4": { terrain: "reeds" },
};

function hexAt(q: number, r: number): BoardHex {
  const key = `${q},${r}`;
  const terrain: TerrainType = q === 2 ? "river" : (special[key]?.terrain ?? "field");
  return {
    coord: { q, r },
    terrain,
    ...(q === LAB_WAGON_PARK.q && r === LAB_WAGON_PARK.r ? { label: "The Wagon Park", objectiveId: "wagon_park", objectiveKind: "wagons" as const } : {}),
    ...(q === LAB_SLUICE.q && r === LAB_SLUICE.r ? { label: "The Sallow Weir", objectiveId: "sallow_sluice", objectiveKind: "sluice" as const } : {}),
    ...(q <= 1 ? { deploymentFaction: "free_banners" as const } : {}),
    ...(q >= 6 ? { deploymentFaction: "ashen_host" as const } : {}),
  };
}

export const twoObjectivesBoard: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

const squad = (id: string, faction: DioramaSquad["faction"], q: number, r: number, extra: Partial<DioramaSquad> = {}): DioramaSquad => ({
  id,
  faction,
  hex: { q, r },
  strength: 80,
  cohesion: 70,
  facing: faction === "free_banners" ? Math.PI : 0,
  ...extra,
});

export const twoObjectivesSquads: DioramaSquad[] = [
  squad("weir_guard", "free_banners", 1, 2),
  squad("weir_spears", "free_banners", 1, 3),
  squad("assault_shields", "free_banners", 4, 2),
  squad("assault_lances", "free_banners", 4, 3),
  // Beside the park, not on it, so the captures show the wagons.
  squad("kept_coal", "ashen_host", 7, 2, { renowned: true }),
  squad("park_thralls", "ashen_host", 7, 1),
  squad("weir_raiders", "ashen_host", 3, 3, { strength: 60 }),
];
