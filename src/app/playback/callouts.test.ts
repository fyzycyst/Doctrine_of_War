import { describe, expect, it } from "vitest";
import { admitCallout, CALLOUT_GAP_PX, layoutCallouts, MAX_CALLOUTS, type CalloutBox, type PlacedCallout } from "./callouts";

const PLAYER = "free_banners" as const;
const HOST = "ashen_host" as const;
const banner = (id: number, faction: typeof PLAYER | typeof HOST, repeat = false): PlacedCallout => ({
  id,
  kind: "rule",
  hex: { q: id, r: 0 },
  faction,
  title: `#${id}`,
  text: "If enemy adjacent → brace shields",
  repeat,
  linger: 1000,
});
const ids = (list: PlacedCallout[] | null) => list?.map((callout) => callout.id);

describe("which banners show (T19 declutter)", () => {
  it("keeps a Host repeat in the caption bar only, but shows the player's repeats", () => {
    const shown = [banner(1, PLAYER)];
    expect(admitCallout(shown, banner(2, HOST, true), PLAYER)).toBeNull();
    expect(ids(admitCallout(shown, banner(3, PLAYER, true), PLAYER))).toEqual([1, 3]);
    expect(ids(admitCallout(shown, banner(4, HOST), PLAYER))).toEqual([1, 4]);
  });

  it(`shows at most ${MAX_CALLOUTS}: the oldest Host banner gives way first, then the oldest of the player's`, () => {
    const full = [banner(1, PLAYER), banner(2, HOST), banner(3, PLAYER), banner(4, HOST)];
    expect(ids(admitCallout(full, banner(5, PLAYER), PLAYER))).toEqual([1, 3, 4, 5]);
    const mine = [banner(1, PLAYER), banner(2, PLAYER), banner(3, PLAYER), banner(4, PLAYER)];
    expect(ids(admitCallout(mine, banner(5, HOST), PLAYER))).toEqual([2, 3, 4, 5]);
  });

  it("never drops the guide's pinned banner, and does not count screen-level callouts", () => {
    const full = [banner(1, PLAYER), banner(2, PLAYER), banner(3, PLAYER), banner(4, PLAYER)];
    expect(ids(admitCallout(full, banner(5, PLAYER), PLAYER, 1))).toEqual([1, 3, 4, 5]);
    const weather: PlacedCallout = { ...banner(6, PLAYER), kind: "weather", hex: null, faction: null };
    expect(ids(admitCallout(full, weather, PLAYER))).toEqual([1, 2, 3, 4, 6]);
  });
});

describe("where banners sit on screen", () => {
  const box = (id: number, cx: number, cy: number, mine = true): CalloutBox => ({ id, cx, cy, w: 200, h: 40, mine });
  const rect = (b: CalloutBox, lift: number) => ({ left: b.cx - b.w / 2, right: b.cx + b.w / 2, top: b.cy - b.h / 2 - lift, bottom: b.cy + b.h / 2 - lift });
  const noOverlap = (boxes: CalloutBox[], lifts: Map<number, number>) => {
    const rects = boxes.map((b) => rect(b, lifts.get(b.id)!));
    for (const [i, a] of rects.entries()) {
      for (const b of rects.slice(i + 1)) {
        const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart).toBe(true);
      }
    }
  };

  it("leaves banners that do not touch where they are", () => {
    const boxes = [box(1, 100, 100), box(2, 600, 100), box(3, 100, 400)];
    expect([...layoutCallouts(boxes).values()]).toEqual([0, 0, 0]);
  });

  it("lifts a newcomer clear of the banner it would cover, with a gap", () => {
    const lifts = layoutCallouts([box(1, 300, 300), box(2, 320, 310)]);
    expect(lifts.get(1)).toBe(0);
    expect(lifts.get(2)).toBe(10 + 40 + CALLOUT_GAP_PX);
  });

  it("puts the player's banners first: a Host banner moves even if it came first", () => {
    const lifts = layoutCallouts([box(1, 300, 300, false), box(2, 300, 300, true)]);
    expect(lifts.get(2)).toBe(0);
    expect(lifts.get(1)).toBeGreaterThan(0);
  });

  it("untangles a crowd on one spot (a large battle's busiest hex)", () => {
    const crowd = Array.from({ length: 6 }, (_, i) => box(i + 1, 300 + (i % 2) * 40, 300 + i * 5, i % 3 !== 0));
    const lifts = layoutCallouts(crowd);
    noOverlap(crowd, lifts);
    for (const lift of lifts.values()) expect(lift).toBeGreaterThanOrEqual(0); // only ever upward
  });
});
