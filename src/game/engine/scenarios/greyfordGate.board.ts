// Greyford Gate, held by the Host: the board Cinder Road's last two battles share (battle 5,
// the pursuit: the broken Host streams back down the Gate Road to the gate; battle 6, the
// finale: the assault on the gate the next day). First Breach's ground, reversed and enlarged
// to 9x8. Agree any change with both battles' authors: it moves both battles' balance.
import type { BoardHex, BoardLayout, HexCoord, TerrainType } from "../../board";

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

/** A side's deployment zone on this board: which hexes it may start on. */
export type DeploymentZone = (coord: HexCoord) => boolean;

export interface GreyfordGateZones {
  /** Default (the finale): q 1-2, the bank west of the field. */
  bannerZone?: DeploymentZone;
  /** Default (the finale): q 5-7, before the wall. */
  hostZone?: DeploymentZone;
}

const FINALE_BANNERS: DeploymentZone = ({ q }) => q >= 1 && q <= 2;
const FINALE_HOST: DeploymentZone = ({ q }) => q >= 5 && q < WALL_Q;

function terrainAt(q: number, r: number): { terrain: TerrainType; label?: string } {
  const override = special[`${q},${r}`];
  const terrain: TerrainType = override?.terrain ?? (q === WALL_Q ? "wall" : q === 0 ? "river" : r === ROAD_R ? "road" : "field");
  const label = override?.label ?? (q === WALL_Q ? "Greyford Wall" : q === 0 ? "The Grey" : r === ROAD_R && q === 1 ? "Gate Road" : undefined);
  return { terrain, ...(label ? { label } : {}) };
}

/**
 * The Greyford Gate board (Cinder Road battles 5 and 6): the same ground every time; only the
 * deployment zones vary by battle. Fails closed: a hex in both zones, or a zone on the wall or
 * in the river (fords are fine), throws.
 */
export function greyfordGateBoard(zones: GreyfordGateZones = {}): BoardLayout {
  const banners = zones.bannerZone ?? FINALE_BANNERS;
  const host = zones.hostZone ?? FINALE_HOST;
  const problems: string[] = [];
  const hexes: BoardHex[] = [];
  for (let q = 0; q < WIDTH; q += 1) {
    for (let r = 0; r < HEIGHT; r += 1) {
      const coord = { q, r };
      const { terrain, label } = terrainAt(q, r);
      const side = banners(coord) ? (host(coord) ? null : ("free_banners" as const)) : host(coord) ? ("ashen_host" as const) : undefined;
      if (side === null) problems.push(`${q},${r} is in both deployment zones`);
      else if (side && (terrain === "wall" || terrain === "river")) problems.push(`${q},${r} (${terrain}) cannot be a deployment hex`);
      hexes.push({
        coord,
        terrain,
        ...(label ? { label } : {}),
        ...(q === GREYFORD_GATE.q && r === GREYFORD_GATE.r ? { objectiveId: "greyford_gate" } : {}),
        ...(side ? { deploymentFaction: side } : {}),
      });
    }
  }
  if (problems.length > 0) throw new Error(`Greyford Gate board: ${problems.join("; ")}`);
  // A ford of the Grey by daylight: no burning bridge wrecks.
  return { width: WIDTH, height: HEIGHT, fordDressing: "none", hexes };
}
