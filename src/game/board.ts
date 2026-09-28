import type { FactionId } from "./types";

export interface HexCoord {
  q: number;
  r: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

export type TerrainType = "road" | "ridge" | "ford" | "wall" | "field" | "ruin";

export interface BoardHex {
  coord: HexCoord;
  terrain: TerrainType;
  label?: string;
  objectiveId?: string;
  deploymentFaction?: FactionId;
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

const cleanFloat = (value: number) => (Math.abs(value) < 1e-10 ? 0 : value);

export function hexToPixel(coord: HexCoord, size: number): PixelPoint {
  return {
    x: cleanFloat(size * 1.5 * coord.q),
    y: cleanFloat(size * Math.sqrt(3) * (coord.r + coord.q / 2)),
  };
}

export function hexPolygonPoints(center: PixelPoint, size: number): PixelPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;

    return {
      x: cleanFloat(center.x + size * Math.cos(angle)),
      y: cleanFloat(center.y + size * Math.sin(angle)),
    };
  });
}

export function boardPixelBounds(layout: BoardLayout, size: number) {
  const points = layout.hexes.flatMap((hex) => hexPolygonPoints(hexToPixel(hex.coord, size), size));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function getHex(layout: BoardLayout, coord: HexCoord): BoardHex | undefined {
  return layout.hexes.find((hex) => sameHex(hex.coord, coord));
}

/** Neighbors of `coord` that exist on the board, in hexNeighbors order. */
export function boardNeighbors(layout: BoardLayout, coord: HexCoord): BoardHex[] {
  return hexNeighbors(coord)
    .map((neighbor) => getHex(layout, neighbor))
    .filter((hex): hex is BoardHex => hex !== undefined);
}

/** Walls (including gate hexes) block movement; every other terrain can be entered. */
export function isPassableTerrain(terrain: TerrainType): boolean {
  return terrain !== "wall";
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
