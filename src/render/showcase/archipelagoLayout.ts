import * as THREE from "three";

/**
 * Campaign-map layout (M1): where each battle's miniature island sits, for 1 to
 * 11+ battles. Pure, so it is tested without a canvas.
 *
 * - Up to 5 battles: one rising S-curve from front-left to back-right (the
 *   original layout, unchanged for the four-battle intro).
 * - 6 or more: a winding road in rows that recede into the distance, the march
 *   turning at the end of each row (6 = 3+3, 8 = 4+4, 11 = 4+4+3), each row a
 *   little higher and gently waved so it doesn't read as a grid.
 */

/** Target radius of every miniature (world units), whatever its board size. */
export const ISLAND_RADIUS = 2.7;
/** Spacing between neighbours in a row, and between rows. */
const COL_X = 6.9;
const ROW_Z = 8.2;

/** Islands per row for `n` battles (a single row up to 5). */
export function islandsPerRow(n: number): number {
  if (n <= 5) return Math.max(1, n);
  if (n <= 8) return Math.ceil(n / 2);
  return Math.ceil(n / 3);
}

/** World placement of island `i` of `n`. */
export function islandPlacement(i: number, n: number): THREE.Vector3 {
  if (n <= 5) {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const x = (t - 0.5) * 6.6 * Math.max(1, n - 1);
    const z = Math.sin(t * Math.PI * 1.6) * 2.2 - t * 2.5;
    const y = Math.sin(t * Math.PI) * 0.8 + t * 0.6;
    return new THREE.Vector3(x, y, z);
  }
  const per = islandsPerRow(n);
  const rows = Math.ceil(n / per);
  const row = Math.floor(i / per);
  const k = i % per;
  // Boustrophedon: even rows run left to right, odd rows come back, so the
  // road turns at the row's end instead of jumping across the map.
  const col = row % 2 === 0 ? k : per - 1 - k;
  const x = (col - (per - 1) / 2) * COL_X + (row % 2 === 0 ? -0.6 : 0.6);
  const z = (rows - 1) * ROW_Z * 0.5 - row * ROW_Z + Math.sin(col * 1.25 + row * 2.1) * 1.1;
  const y = row * 0.55 + Math.sin(col * 0.9 + row) * 0.25;
  return new THREE.Vector3(x, y, z);
}

export interface ArchipelagoBounds {
  center: THREE.Vector3;
  /** Extent along x and z, island centres only. */
  width: number;
  depth: number;
  rows: number;
}

/** Centre and extent of a layout (for camera fitting, shadows and particles). */
export function archipelagoBounds(points: THREE.Vector3[]): ArchipelagoBounds {
  const box = new THREE.Box3().setFromPoints(points.length ? points : [new THREE.Vector3()]);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return { center, width: size.x, depth: size.z, rows: points.length > 5 ? Math.ceil(points.length / islandsPerRow(points.length)) : 1 };
}

/**
 * Overview camera distance and direction that fit the whole layout: the
 * width (plus an island each side) across the frame, and for several rows the
 * depth (foreshortened by the view angle) down it. Multi-row maps look down
 * more steeply so the back rows aren't hidden behind the front ones.
 */
export function overviewFrame(b: ArchipelagoBounds, fovDeg: number, aspect: number): { dist: number; up: number; back: number; lookLift: number } {
  const multi = b.rows > 1;
  const up = multi ? 0.87 : 0.55;
  const back = multi ? 0.5 : 0.84;
  const half = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  const width = Math.max(8, b.width) + ISLAND_RADIUS * 3;
  const distW = width / 2 / half / Math.min(aspect, 2);
  // Foreshortened depth: the view looks down at about atan(up/back).
  const sinElev = up / Math.hypot(up, back);
  const height = b.depth * sinElev + ISLAND_RADIUS * 4;
  const distH = height / 2 / half;
  // A single row sits a little low in the frame (sky above); several rows are centred.
  return { dist: Math.max(distW, distH), up, back, lookLift: multi ? 0 : 0.08 };
}
