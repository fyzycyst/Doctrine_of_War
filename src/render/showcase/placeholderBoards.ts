import type { BoardHex, BoardLayout, TerrainType } from "../../game/board";
import type { RenderTerrain } from "../skins/types";

/**
 * Placeholder boards for campaign battles whose scenarios are not built yet
 * (Saltmarsh Column, Hold for Dawn), so the campaign map can still show a
 * recognisable miniature island. Replace with the real scenario boards later.
 */
export type PlaceholderKind = "saltmarsh" | "holdForDawn";

function layout(width: number, height: number, terrainAt: (q: number, r: number) => RenderTerrain): BoardLayout {
  const hexes: BoardHex[] = [];
  for (let q = 0; q < width; q += 1) {
    // marsh/reeds are render terrains the engine is adding; cast until TerrainType has them.
    for (let r = 0; r < height; r += 1) hexes.push({ coord: { q, r }, terrain: terrainAt(q, r) as TerrainType });
  }
  return { width, height, hexes };
}

export function placeholderBoard(kind: PlaceholderKind): BoardLayout {
  if (kind === "saltmarsh") {
    // A causeway road across the marsh, fords at the channels, reed banks either side.
    return layout(7, 5, (q, r) => {
      if (r === 2) return q === 2 || q === 5 ? "ford" : "road";
      if ((q === 1 || q === 4) && r !== 2) return "reeds";
      if ((q + r) % 3 === 0) return "marsh";
      if (q === 6 && r === 0) return "ruin";
      return "field";
    });
  }
  // Hold for Dawn: the last wall, with a ruined keep and a ridge before it.
  const board = layout(6, 5, (q, r) => {
    if (q === 5) return "wall";
    if (q === 2 && r <= 1) return "ridge";
    if (q === 3 && r === 4) return "ruin";
    if (r === 2 && q < 5) return "road";
    return "field";
  });
  board.hexes = board.hexes.map((h) => (h.coord.q === 5 && h.coord.r === 2 ? { ...h, objectiveId: "last_gate" } : h));
  return board;
}
