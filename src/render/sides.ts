import type { BoardLayout } from "../game/board";
import type { FactionId } from "../game/engine/types";
import { boardCenter, hexToWorld } from "./hexWorld";

/** A side's default facing (yaw) and the way it flees (unit x, z). */
export interface Side {
  facing: number;
  home: [number, number];
}

/**
 * Which way each side faces and flees on a board, from its deployment. The
 * convention (the Host comes from the west: the Banners face west and flee east)
 * holds unless the Banners deploy clearly west of the Host, as in Cinder Road 6,
 * where they attack Greyford Gate from the west: then both turn round. Boards whose
 * sides are north and south (the Saltmarsh) keep the convention.
 */
export function sides(board: BoardLayout): Record<FactionId, Side> {
  const center = boardCenter(board);
  const meanX = (f: FactionId) => {
    const xs = board.hexes.filter((h) => h.deploymentFaction === f).map((h) => hexToWorld(h.coord, center)[0]);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const banners = meanX("free_banners");
  const host = meanX("ashen_host");
  const reversed = banners !== null && host !== null && host - banners > 1;
  return reversed
    ? { free_banners: { facing: 0, home: [-1, 0] }, ashen_host: { facing: Math.PI, home: [1, 0] } }
    : { free_banners: { facing: Math.PI, home: [1, 0] }, ashen_host: { facing: 0, home: [-1, 0] } };
}
