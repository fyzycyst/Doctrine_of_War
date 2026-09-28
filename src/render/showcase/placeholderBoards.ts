import type { BoardHex, BoardLayout, TerrainType } from "../../game/board";

/**
 * Placeholder boards for campaign battles whose scenarios are not built yet
 * (Saltmarsh Column, Hold for Dawn), so the campaign map can still show a
 * recognisable miniature island. Replace with the real scenario boards later.
 */
export type PlaceholderKind = "saltmarsh" | "holdForDawn";

function layout(width: number, height: number, terrainAt: (q: number, r: number) => TerrainType): BoardLayout {
  const hexes: BoardHex[] = [];
  for (let q = 0; q < width; q += 1) {
    for (let r = 0; r < height; r += 1) hexes.push({ coord: { q, r }, terrain: terrainAt(q, r) });
  }
  return { width, height, hexes };
}

export function placeholderBoard(kind: PlaceholderKind): BoardLayout {
  if (kind === "saltmarsh") {
    // Marsh channels and fords with a causeway road running through.
    return layout(6, 5, (q, r) => {
      if (r === 2) return q === 2 || q === 4 ? "ford" : "road";
      if ((q + r) % 4 === 0) return "ford";
      if (q === 5 && r === 0) return "ruin";
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
