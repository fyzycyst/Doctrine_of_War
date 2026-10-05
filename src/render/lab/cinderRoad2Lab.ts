import type { BoardHex, BoardLayout, TerrainType } from "../../game/board";
import type { DioramaSquad } from "../figures/types";

/**
 * Lab copy of Cinder Road battle 2's board (`cinder_road_wagon_park`, engine #2's
 * branch) for render work until it lands. Render-relevant fields only: terrain,
 * labels, the two objectives and their kinds, deployment, and `fordDressing:
 * "none"` (its fords are fords, not burned bridges). Replace with the engine's
 * board once merged.
 *
 * The Emberwater runs down q = 4; a sluice race branches off at the top right.
 * The Host holds the west bank and its wagon park; the Banners hold the east bank
 * and the sluice-house at the weir, reached dry only by the Sluice Walk (6,1).
 */
export const C2_WAGON_PARK = { q: 1, r: 6 };
export const C2_SLUICE = { q: 7, r: 0 };
export const C2_SLUICE_WALK = { q: 6, r: 1 };

const SIZE = 8;
const special: Record<string, { terrain: TerrainType; label?: string }> = {
  "4,0": { terrain: "ford", label: "The Sallow Weir" },
  "4,4": { terrain: "ford", label: "The Shallows" },
  "4,5": { terrain: "ford", label: "The Wainford" },
  "4,6": { terrain: "ford", label: "The Shallows" },
  "4,7": { terrain: "ford", label: "Low Ford" },
  "6,0": { terrain: "river" },
  "7,0": { terrain: "river", label: "The Sluice-House" },
  "7,1": { terrain: "river" },
  "6,1": { terrain: "road", label: "The Sluice Walk" },
  "6,2": { terrain: "road", label: "The Weir Road" },
  "6,3": { terrain: "road" },
  "5,4": { terrain: "road" },
  "3,5": { terrain: "road", label: "The Wagon Track" },
  "2,6": { terrain: "road" },
  "1,6": { terrain: "field", label: "The Wagon Park" },
  "0,2": { terrain: "ruin", label: "Burnt Mill" },
  "0,7": { terrain: "reeds", label: "Sedge Bank" },
  "7,6": { terrain: "ridge", label: "Willow Rise" },
};

function hexAt(q: number, r: number): BoardHex {
  const key = `${q},${r}`;
  const s = special[key];
  const terrain: TerrainType = s?.terrain ?? (q === 4 ? "river" : "field");
  return {
    coord: { q, r },
    terrain,
    ...(s?.label ? { label: s.label } : {}),
    ...(key === "1,6" ? { objectiveId: "wagon_park", objectiveKind: "wagons" as const } : {}),
    ...(key === "7,0" ? { objectiveId: "weir_sluice", objectiveKind: "sluice" as const } : {}),
    ...(q <= 1 && key !== "1,6" ? { deploymentFaction: "ashen_host" as const } : {}),
    ...(q >= 6 && terrain !== "river" ? { deploymentFaction: "free_banners" as const } : {}),
  };
}

export const cinderRoad2LabBoard: BoardLayout = {
  width: SIZE,
  height: SIZE,
  fordDressing: "none",
  hexes: Array.from({ length: SIZE }, (_, q) => Array.from({ length: SIZE }, (_, r) => hexAt(q, r))).flat(),
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

export const cinderRoad2LabSquads: DioramaSquad[] = [
  squad("sluice_guard", "free_banners", 6, 2),
  squad("assault_shields", "free_banners", 5, 5),
  squad("assault_lances", "free_banners", 6, 6),
  squad("standard", "free_banners", 6, 4),
  squad("kept_coal", "ashen_host", 0, 6, { renowned: true }),
  squad("park_thralls", "ashen_host", 1, 5),
  // Raiders with the ram, come over the Sallow Weir for the sluice.
  squad("weir_raiders", "ashen_host", 5, 0, { strength: 60 }),
  squad("cinderram", "ashen_host", 5, 1, { kind: "siege" }),
];
