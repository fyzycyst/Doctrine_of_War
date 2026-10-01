// Callout declutter (T19 playtest: "on larger scenarios, the banners often overlap").
// Pure: which banners are on the board, and where each sits so none overprint.
import type { FactionId } from "../../game/engine";
import type { CalloutSpec } from "./director";

/** At most this many banners over the board at once. */
export const MAX_CALLOUTS = 4;
/** Space kept between two banners, in CSS pixels. */
export const CALLOUT_GAP_PX = 6;

export interface PlacedCallout extends CalloutSpec {
  id: number;
}

/**
 * The banners after `next` arrives, or null when it adds no banner. A Host rule the
 * player has already seen this phase (a repeat) stays in the caption bar only. Over the
 * cap, the oldest Host banner gives way first, then the oldest of the player's; the
 * guide's pinned banner never does. Screen-level callouts (weather, the dawn turn) have no
 * board anchor and are not counted.
 */
export function admitCallout(callouts: PlacedCallout[], next: PlacedCallout, playerFaction: FactionId, pinned: number | null = null): PlacedCallout[] | null {
  if (next.kind === "rule" && next.repeat && next.faction !== playerFaction) return null;
  let list = [...callouts, next];
  const onBoard = () => list.filter((callout) => callout.hex);
  while (next.hex && onBoard().length > MAX_CALLOUTS) {
    const candidates = onBoard().filter((callout) => callout.id !== next.id && callout.id !== pinned);
    const victim = candidates.find((callout) => callout.faction !== playerFaction) ?? candidates[0];
    if (!victim) break;
    list = list.filter((callout) => callout !== victim);
  }
  return list;
}

/** A banner as drawn: its anchor on screen (centre), its size, and whose it is. */
export interface CalloutBox {
  id: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  mine: boolean;
}

const overlaps = (a: { left: number; right: number; top: number; bottom: number }, b: typeof a, gap: number) =>
  a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;

/**
 * How far to lift each banner (px, upward) so no two overprint. The player's banners are
 * placed first, then the Host's, oldest first within each (so a banner already on screen
 * keeps its place and a newcomer moves); each is lifted above whatever it would cover.
 */
export function layoutCallouts(boxes: CalloutBox[], gap = CALLOUT_GAP_PX): Map<number, number> {
  const order = [...boxes].sort((a, b) => Number(b.mine) - Number(a.mine) || a.id - b.id);
  const placed: { left: number; right: number; top: number; bottom: number }[] = [];
  const lifts = new Map<number, number>();
  for (const box of order) {
    const rect = { left: box.cx - box.w / 2, right: box.cx + box.w / 2, top: box.cy - box.h / 2, bottom: box.cy + box.h / 2 };
    let lift = 0;
    // Each pass lifts the banner clear of the lowest rectangle it still covers.
    for (let guard = 0; guard <= placed.length; guard += 1) {
      const hit = placed.filter((other) => overlaps(rect, other, gap)).sort((a, b) => b.bottom - a.bottom)[0];
      if (!hit) break;
      const dy = rect.bottom - (hit.top - gap);
      rect.top -= dy;
      rect.bottom -= dy;
      lift += dy;
    }
    placed.push(rect);
    lifts.set(box.id, lift);
  }
  return lifts;
}
