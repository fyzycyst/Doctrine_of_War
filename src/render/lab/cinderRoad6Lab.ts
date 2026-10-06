import type { BoardHex, BoardLayout, TerrainType } from "../../game/board";
import type { SquadSetup } from "../../game/engine/types";

/**
 * Lab copy of Cinder Road 6, Break the Strongpoint (`cinder_road_greyford_gate`), from
 * engine #2's `hack/m2-cr6` at 99842b1, until it merges: the board and the squads'
 * render fields only. Greyford Gate held by the Host in the Greyford Wall down the
 * east edge (q = 8); the Banners come from the west, over the Grey (q = 0). Day, under
 * ash-wind. Replace with the engine's scenario when it lands.
 */
export const CR6_GATE = { q: 8, r: 3 };
/** The gate's standable neighbours: the finale beat frames (7,3) and the gate. */
export const CR6_GATE_FRONT = { q: 7, r: 3 };
export const CR6_SIEGE_APPROACH = { q: 6, r: 3 };

const WIDTH = 9;
const HEIGHT = 8;
const WALL_Q = 8;
const ROAD_R = 3;

const special: Record<string, { terrain: TerrainType; label?: string }> = {
  "0,2": { terrain: "ford", label: "River Ford" },
  "0,3": { terrain: "ford" },
  "2,0": { terrain: "ridge", label: "North Ridge" },
  "3,0": { terrain: "ridge" },
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

export const cinderRoad6LabBoard: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  fordDressing: "none",
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};

type LabSquad = Pick<SquadSetup, "id" | "faction" | "hex" | "strength" | "cohesion" | "role" | "renown">;
const B = "free_banners" as const;
const H = "ashen_host" as const;
const s = (id: string, faction: typeof B | typeof H, role: SquadSetup["role"], q: number, r: number, strength: number, cohesion: number, renown?: string): LabSquad => ({
  id,
  faction,
  role,
  hex: { q, r },
  strength,
  cohesion,
  ...(renown ? { renown: { title: renown } } : {}),
});

/** The squads as engine #2 has them (99842b1), for `dioramaSquads`. */
export const cinderRoad6LabSquadSetups: LabSquad[] = [
  s("north_van", B, "frontline", 2, 2, 84, 74),
  s("gate_van", B, "frontline", 1, 3, 80, 70),
  s("road_van", B, "frontline", 1, 4, 72, 64),
  s("south_van", B, "frontline", 2, 5, 76, 68),
  s("standard", B, "support", 2, 3, 52, 82),
  s("bows", B, "skirmish", 2, 4, 62, 68),
  s("lances", B, "cavalry", 1, 1, 68, 64),
  s("riders", B, "cavalry", 1, 6, 72, 66),
  s("slingers", B, "skirmish", 2, 6, 64, 70),
  s("slagwall_oathguard", H, "frontline", 7, 2, 38, 76, "The Kept Coal"),
  s("kilnborn_oathguard", H, "frontline", 7, 5, 28, 66),
  s("north_wardens", H, "frontline", 7, 1, 14, 56),
  s("south_wardens", H, "frontline", 7, 6, 14, 56),
  s("gate_ward", H, "frontline", 6, 3, 14, 60),
  s("coal_bearers", H, "frontline", 6, 4, 14, 60),
  s("pyre_sworn", H, "frontline", 7, 0, 24, 60),
  s("cindermaw_thralls", H, "frontline", 7, 7, 20, 54),
  s("ember_hunters", H, "skirmish", 5, 0, 18, 58),
  s("ash_harriers", H, "skirmish", 5, 7, 18, 58),
];
