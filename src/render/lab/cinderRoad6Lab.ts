import type { BoardHex, BoardLayout, TerrainType } from "../../game/board";
import type { DioramaSquad } from "../figures/types";

/**
 * Lab stand-in for Cinder Road 6, the finale (engine #2's `hack/m2-cr6`, board not yet
 * stable): Greyford Gate held by the Host, attacked by the Banners from the west. First
 * Breach's ground reversed and enlarged to 9x8, with about 22 squads. Render-relevant
 * fields only; replace with the engine's board when it lands.
 */
export const CR6_GATE = { q: 6, r: 3 };
export const CR6_SIEGE_APPROACH = { q: 5, r: 3 };

const WIDTH = 9;
const HEIGHT = 8;
const special: Record<string, { terrain: TerrainType; label?: string }> = {
  "0,3": { terrain: "ford", label: "River Ford" },
  "1,0": { terrain: "ridge", label: "North Ridge" },
  "2,0": { terrain: "ridge" },
  "1,3": { terrain: "road" },
  "2,3": { terrain: "road", label: "Gate Road" },
  "3,3": { terrain: "road" },
  "4,3": { terrain: "road" },
  "5,3": { terrain: "road", label: "Siege Approach" },
  "5,0": { terrain: "ruin", label: "Broken Watch" },
  // The flanking works the sworn companies sally from.
  "5,1": { terrain: "ruin", label: "North Works" },
  "5,5": { terrain: "ruin", label: "South Works" },
  "6,1": { terrain: "wall" },
  "6,2": { terrain: "wall" },
  "6,3": { terrain: "wall", label: "Greyford Gate" },
  "6,4": { terrain: "wall" },
  "6,5": { terrain: "wall" },
  "3,6": { terrain: "ridge" },
  "2,6": { terrain: "ruin" },
};

function hexAt(q: number, r: number): BoardHex {
  const key = `${q},${r}`;
  const s = special[key];
  const terrain: TerrainType = s?.terrain ?? "field";
  return {
    coord: { q, r },
    terrain,
    ...(s?.label ? { label: s.label } : {}),
    ...(key === "6,3" ? { objectiveId: "greyford_gate" } : {}),
    ...(q <= 2 ? { deploymentFaction: "free_banners" as const } : {}),
    ...(q >= 5 && terrain !== "wall" ? { deploymentFaction: "ashen_host" as const } : {}),
  };
}

export const cinderRoad6LabBoard: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  fordDressing: "none",
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

const squad = (id: string, faction: DioramaSquad["faction"], q: number, r: number, extra: Partial<DioramaSquad> = {}): DioramaSquad => ({
  id,
  faction,
  hex: { q, r },
  strength: 80,
  cohesion: 70,
  facing: faction === "free_banners" ? 0 : Math.PI,
  ...extra,
});

/** The Banners face east (at the gate), the Host west (at them): the reverse of First Breach. */
export const cinderRoad6LabSquads: DioramaSquad[] = [
  ...[
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 1],
    [1, 2],
    [1, 4],
    [1, 5],
    [2, 1],
    [2, 2],
    [2, 4],
  ].map(([q, r], i) => squad(`banner_${i}`, "free_banners", q, r, i === 4 ? { renowned: true } : {})),
  // No Banner siege squad: the only siege model is the Host's Cinderram (coal head, embers).
  squad("banner_reserve", "free_banners", 1, 3),
  // The Kept Coal's main body before the gate (a hex out, so the lab shots see the gate);
  // sworn companies in the flanking works.
  squad("kept_coal", "ashen_host", 4, 3, { renowned: true }),
  squad("sworn_north", "ashen_host", 5, 1),
  squad("sworn_south", "ashen_host", 5, 5),
  squad("gate_guard_n", "ashen_host", 5, 2),
  squad("gate_guard_s", "ashen_host", 5, 4),
  ...[
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [8, 2],
    [8, 3],
  ].map(([q, r], i) => squad(`host_${i}`, "ashen_host", q, r)),
];
