import * as THREE from "three";
import type { BoardLayout } from "../../game/board";
import { boardCenter, boardRadius, hexToWorld } from "../hexWorld";

/**
 * Keyframed cinematic camera paths (capture mode / video). Pure data plus a pure
 * sampler: Catmull-Rom through the keys for position and target, eased time.
 */

export type Vec3 = [number, number, number];

export interface CameraKeyframe {
  /** Seconds from the start of the path. */
  t: number;
  position: Vec3;
  target: Vec3;
  fov?: number;
}

export interface CameraPath {
  id: string;
  label: string;
  duration: number;
  /** "loop" wraps, "pingpong" goes back and forth, "once" holds the last key. */
  mode: "once" | "loop" | "pingpong";
  keys: CameraKeyframe[];
}

export interface CameraSample {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

const DEFAULT_FOV = 30;
const smooth = (u: number) => u * u * (3 - 2 * u);

/** Local time within the path for a global time, per the path's mode. */
export function pathTime(path: CameraPath, time: number): number {
  const d = path.duration;
  if (d <= 0) return 0;
  if (path.mode === "loop") return ((time % d) + d) % d;
  if (path.mode === "pingpong") {
    const m = ((time % (2 * d)) + 2 * d) % (2 * d);
    return m <= d ? m : 2 * d - m;
  }
  return Math.max(0, Math.min(d, time));
}

/** Samples a path at a global time (seconds). Pure: returns a new sample. */
export function sampleCameraPath(path: CameraPath, time: number): CameraSample {
  return sampleCameraPathInto(path, time, {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    fov: DEFAULT_FOV,
  });
}

/**
 * Same as `sampleCameraPath`, writing into `out` with no allocation, for
 * per-frame use (e.g. CinematicCamera). Returns `out`.
 */
export function sampleCameraPathInto(path: CameraPath, time: number, out: CameraSample): CameraSample {
  const keys = path.keys;
  const t = pathTime(path, time);
  const last = keys[keys.length - 1];
  if (keys.length === 1 || t <= keys[0].t) return fromKey(keys[0], out);
  if (t >= last.t) return fromKey(last, out);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const u = smooth((t - a.t) / Math.max(1e-6, b.t - a.t));
  const k0 = keys[Math.max(0, i - 1)];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  catmullInto(k0.position, a.position, b.position, k3.position, u, out.position);
  catmullInto(k0.target, a.target, b.target, k3.target, u, out.target);
  out.fov = THREE.MathUtils.lerp(a.fov ?? DEFAULT_FOV, b.fov ?? DEFAULT_FOV, u);
  return out;
}

function fromKey(key: CameraKeyframe, out: CameraSample): CameraSample {
  out.position.set(key.position[0], key.position[1], key.position[2]);
  out.target.set(key.target[0], key.target[1], key.target[2]);
  out.fov = key.fov ?? DEFAULT_FOV;
  return out;
}

function catmull1(p0: number, p1: number, p2: number, p3: number, u: number, u2: number, u3: number) {
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

function catmullInto(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number, out: THREE.Vector3) {
  const u2 = u * u;
  const u3 = u2 * u;
  return out.set(
    catmull1(p0[0], p1[0], p2[0], p3[0], u, u2, u3),
    catmull1(p0[1], p1[1], p2[1], p3[1], u, u2, u3),
    catmull1(p0[2], p1[2], p2[2], p3[2], u, u2, u3),
  );
}

// ---------------------------------------------------------------------------
// Board-derived cinematic paths
// ---------------------------------------------------------------------------

export type CinematicPathId = "craneInGate" | "bannerDolly" | "riverPush" | "titleFlyover";

/**
 * Cinematic paths for a board, derived from its geometry: the objective (gate),
 * the Banners' deployment line, and any river. Paths that don't apply to the
 * board (no river) are omitted.
 */
export function cinematicPaths(board: BoardLayout): Partial<Record<CinematicPathId, CameraPath>> {
  const center = boardCenter(board);
  const radius = boardRadius(board);
  const world = (q: number, r: number, y = 0.3): Vec3 => {
    const [x, z] = hexToWorld({ q, r }, center);
    return [x, y, z];
  };
  const objective = board.hexes.find((h) => h.objectiveId) ?? board.hexes.find((h) => h.terrain === "wall");
  const gate: Vec3 = objective ? world(objective.coord.q, objective.coord.r, 0.4) : [0, 0.3, 0];

  const paths: Partial<Record<CinematicPathId, CameraPath>> = {};

  // 1. Crane-in on the gate: from a high wide view down to just above the defenders.
  paths.craneInGate = {
    id: "craneInGate",
    label: "Crane-in on the gate",
    duration: 8,
    mode: "once",
    keys: [
      { t: 0, position: [gate[0] - radius * 0.2, radius * 1.9, gate[2] + radius * 1.6], target: [0, 0, 0.4], fov: 32 },
      { t: 4, position: [gate[0] - radius * 0.35, radius * 0.9, gate[2] + radius * 0.95], target: [gate[0] * 0.6, 0.3, gate[2] * 0.6], fov: 30 },
      { t: 8, position: [gate[0] - 2.6, 1.3, gate[2] + 2.9], target: [gate[0] - 0.8, 0.45, gate[2]], fov: 28 },
    ],
  };

  // 2. Low dolly along the Banner line (their deployment hexes, north to south).
  const banner = board.hexes.filter((h) => h.deploymentFaction === "free_banners").map((h) => world(h.coord.q, h.coord.r));
  if (banner.length > 0) {
    const zs = banner.map((p) => p[2]);
    const xs = banner.map((p) => p[0]);
    const x = xs.reduce((a, b) => a + b, 0) / xs.length;
    const zMin = Math.min(...zs);
    const zMax = Math.max(...zs);
    // The camera runs low in the gap before the line, looking along it toward the gate side.
    paths.bannerDolly = {
      id: "bannerDolly",
      label: "Low dolly along the Banner line",
      duration: 10,
      mode: "once",
      keys: [
        { t: 0, position: [x - 1.5, 1.3, zMin - 1.4], target: [x + 0.4, 0.4, zMin + 0.6], fov: 34 },
        { t: 5, position: [x - 1.4, 1.2, (zMin + zMax) / 2 - 0.4], target: [x + 0.5, 0.4, (zMin + zMax) / 2 + 0.9], fov: 34 },
        { t: 10, position: [x - 1.5, 1.35, zMax + 0.6], target: [x + 0.4, 0.45, zMax + 2], fov: 34 },
      ],
    };
  }

  // 3. River-level push along the river (Ember Ford).
  const river = board.hexes.filter((h) => h.terrain === "river" || h.terrain === "ford");
  if (board.hexes.some((h) => h.terrain === "river") && river.length > 1) {
    const pts = river.map((h) => world(h.coord.q, h.coord.r, 0.35)).sort((a, b) => b[2] - a[2]);
    const start = pts[0];
    const mid = pts[Math.floor(pts.length / 2)];
    const end = pts[pts.length - 1];
    paths.riverPush = {
      id: "riverPush",
      label: "River-level push at the ford",
      duration: 9,
      mode: "once",
      keys: [
        // Low over the water, a little to the Banners' (east) side so it slides past the burning wrecks.
        { t: 0, position: [start[0] + 0.9, 1.0, start[2] + 2.8], target: [mid[0], 0.3, mid[2]], fov: 34 },
        { t: 4.5, position: [mid[0] + 1.1, 0.95, mid[2] + 2.4], target: [end[0] - 0.2, 0.35, end[2] + 0.4], fov: 32 },
        { t: 9, position: [end[0] + 0.9, 1.1, end[2] + 2.2], target: [end[0] - 0.3, 0.45, end[2] - 1.5], fov: 30 },
      ],
    };
  }

  // 4. Title flyover: a slow crane that swings across the island and back.
  paths.titleFlyover = {
    id: "titleFlyover",
    label: "Title flyover (idle loop)",
    duration: 36,
    mode: "pingpong",
    keys: [
      { t: 0, position: [-radius * 1.7, radius * 1.2, radius * 2.05], target: [gate[0] * 0.35, radius * 0.22, gate[2] * 0.35], fov: 30 },
      { t: 18, position: [radius * 0.2, radius * 0.88, radius * 2.3], target: [gate[0] * 0.45, radius * 0.2, gate[2] * 0.4], fov: 29 },
      { t: 36, position: [radius * 1.5, radius * 1.1, radius * 1.8], target: [gate[0] * 0.3, radius * 0.22, gate[2] * 0.3], fov: 30 },
    ],
  };

  return paths;
}
