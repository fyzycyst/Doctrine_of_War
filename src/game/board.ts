export interface HexCoord {
  q: number;
  r: number;
}

export type TerrainType = "road" | "ridge" | "ford" | "wall" | "field" | "ruin";

export interface BoardHex {
  coord: HexCoord;
  terrain: TerrainType;
  label?: string;
  objectiveId?: string;
}

export interface BoardLayout {
  hexes: BoardHex[];
  width: number;
  height: number;
}

const neighborOffsets: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function sameHex(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -a.q - a.r - (-b.q - b.r);

  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

export function hexNeighbors(coord: HexCoord): HexCoord[] {
  return neighborOffsets.map((offset) => ({
    q: coord.q + offset.q,
    r: coord.r + offset.r,
  }));
}

export function getHex(layout: BoardLayout, coord: HexCoord): BoardHex | undefined {
  return layout.hexes.find((hex) => sameHex(hex.coord, coord));
}

export function terrainDefenseBonus(terrain: TerrainType): number {
  switch (terrain) {
    case "ridge":
      return 3;
    case "ford":
      return -1;
    case "wall":
      return 4;
    case "ruin":
      return 2;
    case "field":
    case "road":
      return 0;
  }
}
