import { hexKey, type BoardLayout, type HexCoord } from "../game/board";
import { HEX_SIZE } from "./hexWorld";

/**
 * Pure picking helpers: world-space hit points → board hexes → squads.
 * The diorama raycasts the island/figures and feeds hits through these; the
 * results go to the zustand store (hoveredHex, selectedHex, selectedSquadId).
 */

/** Rounds fractional axial coordinates to the nearest hex (cube rounding). */
export function roundAxial(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

/** Inverse of `hexToWorld` (flat-top, `hexToPixel` layout, board centred). */
export function worldToHex(x: number, z: number, center: { x: number; z: number }, size = HEX_SIZE): HexCoord {
  const px = (x + center.x) / size;
  const py = (z + center.z) / size;
  const q = px / 1.5;
  const r = py / Math.sqrt(3) - q / 2;
  return roundAxial(q, r);
}

/** The board hex under a world point, or null when the point is off the board. */
export function pickBoardHex(
  point: { x: number; z: number },
  layout: BoardLayout,
  center: { x: number; z: number },
): HexCoord | null {
  const hex = worldToHex(point.x, point.z, center);
  return layout.hexes.some((h) => h.coord.q === hex.q && h.coord.r === hex.r) ? hex : null;
}

export function squadAtHex(hex: HexCoord | null, squads: Array<{ id: string; hex: HexCoord }>): string | null {
  if (!hex) return null;
  const key = hexKey(hex);
  return squads.find((s) => hexKey(s.hex) === key)?.id ?? null;
}

/** A click on a board hex selects the squad standing there, else just the hex. */
export function resolveClick(
  hex: HexCoord | null,
  squads: Array<{ id: string; hex: HexCoord }>,
): { hex: HexCoord | null; squadId: string | null } {
  return { hex, squadId: squadAtHex(hex, squads) };
}

/**
 * Writes a board pick (a hex, or a figure) to the store: the hex, then the squad on it.
 * Always in this order: board actions (deploying, mustering, relieving) act when the hex
 * changes, on the company selected before the click, so the clicked squad must not
 * replace it first (T33: clicking a worn company's figure didn't plan its relief).
 */
export function selectPick(
  app: { selectHex: (hex: HexCoord | null) => void; selectSquad: (id: string | null) => void },
  hex: HexCoord | null,
  squadId: string | null,
) {
  app.selectHex(hex);
  app.selectSquad(squadId);
}

export function sameHexOrNull(a: HexCoord | null, b: HexCoord | null) {
  return a === b || (!!a && !!b && a.q === b.q && a.r === b.r);
}
