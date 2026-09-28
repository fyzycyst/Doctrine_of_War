import { hexDistance, hexKey, hexNeighbors, hexToPixel, type BoardLayout, type HexCoord } from "../game/board";

/** Hex circumradius in world units. Flat-top layout, matching `hexToPixel`. */
export const HEX_SIZE = 1;

/** Deterministic PRNG so the island, props and captures are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-hex random in [0,1). */
export function hexRandom(coord: HexCoord, salt = 0): number {
  const seed = (coord.q * 73856093) ^ (coord.r * 19349663) ^ (salt * 83492791);
  return mulberry32(seed)();
}

export function boardCenter(layout: BoardLayout): { x: number; z: number } {
  const points = layout.hexes.map((hex) => hexToPixel(hex.coord, HEX_SIZE));
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const z = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return { x, z };
}

/** World-space (x, z) of a hex centre, with the board centred on the origin. */
export function hexToWorld(coord: HexCoord, center: { x: number; z: number }): [number, number] {
  const p = hexToPixel(coord, HEX_SIZE);
  return [p.x - center.x, p.y - center.z];
}

/** Flat-top corner i (0..5) offset from a hex centre, in world (x, z). */
export function hexCorner(i: number, radius = HEX_SIZE): [number, number] {
  const angle = (Math.PI / 3) * i;
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

export interface ShoreHex {
  coord: HexCoord;
  /** Distance (in hexes) to the nearest playable hex. */
  ring: number;
}

/**
 * Decorative, non-playable hexes around the board so it reads as a floating
 * island. Ring 1 is always kept; outer rings are pruned randomly (seeded) so the
 * coastline is irregular rather than a perfect rhombus.
 */
export function islandShore(layout: BoardLayout, rings = 2, keepOuter = 0.55): ShoreHex[] {
  const board = new Set(layout.hexes.map((hex) => hexKey(hex.coord)));
  const seen = new Map<string, ShoreHex>();
  let frontier = layout.hexes.map((hex) => hex.coord);

  for (let ring = 1; ring <= rings; ring += 1) {
    const next: HexCoord[] = [];
    for (const coord of frontier) {
      for (const n of hexNeighbors(coord)) {
        const key = hexKey(n);
        if (board.has(key) || seen.has(key)) continue;
        seen.set(key, { coord: n, ring });
        next.push(n);
      }
    }
    frontier = next;
  }

  return [...seen.values()].filter((shore) => {
    if (shore.ring === 1) return true;
    // Keep outer hexes more often when they sit next to several kept hexes.
    const nearBoard = layout.hexes.some((hex) => hexDistance(hex.coord, shore.coord) <= shore.ring - 1);
    return nearBoard && hexRandom(shore.coord, 7) < keepOuter;
  });
}
