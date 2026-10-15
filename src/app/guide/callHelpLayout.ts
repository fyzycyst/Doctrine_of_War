// Geometry for "How the call works" (T25, T27 §1): pure, so the layout rules are tested on
// real measurements without a browser.
//   - A ring sits RING_PAD outside its target.
//   - The Posts and Company selection rings split the post rows at the midpoint between the
//     two columns, with RING_GAP between them, and share the rows' full height.
//   - Each ring's number sits at its top-right corner, placed so it covers nothing:
//       "inside"  within the corner (empty space there: the Posts column, the Host box);
//       "edge"    on the top border, horizontally inside (Company selection: clear of its
//                 first row's controls, and of the Posts ring);
//       "outside" just beyond the corner, as the coach marks do (the Roll, a button).

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const RING_PAD = 6;
export const RING_GAP = 8;
export const BADGE = 22;
const BADGE_INSET = 6;
export type BadgePlace = "inside" | "edge" | "outside";

const toBox = (rect: Box): Box => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });

export function ringOf(target: Box): Box {
  return { left: target.left - RING_PAD, top: target.top - RING_PAD, right: target.right + RING_PAD, bottom: target.bottom + RING_PAD };
}

/**
 * The Posts and Company selection targets: the post rows' full height for both, split at
 * the midpoint between the heads' right edge and the company controls' left edge.
 */
export function columnTargets(rows: Box[], heads: Box[], companies: Box[]): { posts: Box; selection: Box } | null {
  if (rows.length === 0 || heads.length === 0 || companies.length === 0) return null;
  const top = Math.min(...rows.map((row) => row.top));
  const bottom = Math.max(...rows.map((row) => row.bottom));
  const left = Math.min(...heads.map((head) => head.left));
  const right = Math.max(...companies.map((company) => company.right));
  const split = (Math.max(...heads.map((head) => head.right)) + Math.min(...companies.map((company) => company.left))) / 2;
  return {
    posts: toBox({ left, top, right: split - RING_GAP / 2 - RING_PAD, bottom }),
    selection: toBox({ left: split + RING_GAP / 2 + RING_PAD, top, right, bottom }),
  };
}

/** Where a ring's number sits (see the module note). */
export function badgeRect(ring: Box, at: BadgePlace = "outside"): Box {
  if (at === "outside") return { left: ring.right - BADGE / 2, top: ring.top - BADGE / 2, right: ring.right + BADGE / 2, bottom: ring.top + BADGE / 2 };
  const right = ring.right - BADGE_INSET;
  const top = at === "inside" ? ring.top + BADGE_INSET : ring.top - BADGE / 2;
  return { left: right - BADGE, top, right, bottom: top + BADGE };
}
