// Greyford Gate, held by the Host: the board Cinder Road's last two battles share (battle 5,
// the pursuit: the broken Host streams back down the Gate Road to the gate; battle 6, the
// finale: the assault on the gate the next day). First Breach's ground, reversed and enlarged
// to 9x8. Agree any change with both battles' authors: it moves both battles' balance.
import type { BoardHex, BoardLayout, TerrainType } from "../../board";

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

/** The Greyford Gate board: Cinder Road battles 5 (the pursuit) and 6 (the finale). */
export const greyfordGateBoard: BoardLayout = {
  width: WIDTH,
  height: HEIGHT,
  // A ford of the Grey by daylight: no burning bridge wrecks.
  fordDressing: "none",
  hexes: Array.from({ length: WIDTH }, (_, q) => Array.from({ length: HEIGHT }, (_, r) => hexAt(q, r))).flat(),
};
