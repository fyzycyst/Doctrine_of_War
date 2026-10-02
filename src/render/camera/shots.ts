import * as THREE from "three";
import type { BoardLayout } from "../../game/board";
import { boardCenter, boardRadius, hexToWorld } from "../hexWorld";

/** Pure camera framing (no React/drei): shared by DioramaCamera, the Diorama's fog offset and tests. */
export interface CameraShot {
  target: [number, number, number];
  /** Azimuth in degrees; 0 = looking north from the south (+z). */
  azimuth: number;
  /** Polar angle from straight down, in degrees. */
  polar: number;
  distance: number;
}

/**
 * Default shot framing the playable board (look-lock #2): centred on the board,
 * a little higher than eye level, distance scaled to the board's radius so the
 * shore and cliffs are a frame, not the subject.
 */
export function wideShot(boardRadius: number): CameraShot {
  return { target: [0, 0.1, 0.9], azimuth: -8, polar: 50, distance: boardRadius * 2.75 };
}

/** Boards up to this radius (Ember Ford's) keep the plain `wideShot` framing. */
const WIDE_REF_RADIUS = 9.3;

/**
 * The wide shot for a specific board. Boards bigger than Ember Ford (Saltmarsh,
 * Hold for Dawn) get a tighter frame biased toward the Banners' deployment and
 * the objectives, so an army on each edge doesn't leave a big empty middle (the
 * Host's advance fills it as the battle goes on). Smaller boards are unchanged.
 */
export function wideShotFor(board: BoardLayout): CameraShot {
  const r = boardRadius(board);
  const big = THREE.MathUtils.clamp((r - WIDE_REF_RADIUS) / 2, 0, 1);
  const shot = wideShot(WIDE_REF_RADIUS + Math.max(0, r - WIDE_REF_RADIUS) * 0.45);
  if (big === 0) return wideShot(r);
  const center = boardCenter(board);
  const focus = board.hexes.filter((h) => h.deploymentFaction === "free_banners" || h.objectiveId);
  if (focus.length === 0) return shot;
  let fx = 0;
  let fz = 0;
  for (const h of focus) {
    const [x, z] = hexToWorld(h.coord, center);
    fx += x / focus.length;
    fz += z / focus.length;
  }
  const w = 0.35 * big;
  return { ...shot, target: [shot.target[0] + fx * w, shot.target[1], shot.target[2] + fz * w] };
}

/** Close-up on a point of interest (e.g. the objective), for detail shots. */
export function closeShot(target: [number, number, number]): CameraShot {
  return { target: [target[0] - 0.9, target[1] + 0.1, target[2] - 0.6], azimuth: 18, polar: 56, distance: 6.2 };
}

