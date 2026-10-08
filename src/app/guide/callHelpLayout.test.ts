// T27 §1: "How the call works" — the Posts (1) and Company selection (2) rings share one
// height, never overlap, and each numbered badge sits inside its own ring's corner, clear of
// the other ring. Rectangles measured from the real screen at 1600, 1280 and with veterans.
import { describe, expect, it } from "vitest";
import { badgeRect, columnTargets, ringOf, type Box } from "./callHelpLayout";

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });
const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const inside = (inner: Box, outer: Box) => inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;

/** Six post rows: the row, its head (left column) and its company control (right column, vertically centred). */
function screen({ left, headRight, companyLeft, right, top, rowHeight, controlHeight }: Record<string, number>) {
  const rows = Array.from({ length: 6 }, (_, index) => box(left, top + index * (rowHeight + 6), right, top + index * (rowHeight + 6) + rowHeight));
  return {
    rows,
    heads: rows.map((row) => box(row.left, row.top + 2, headRight, row.bottom - 2)),
    companies: rows.map((row) => {
      const middle = (row.top + row.bottom) / 2;
      return box(companyLeft, middle - controlHeight / 2, right - 26, middle + controlHeight / 2);
    }),
  };
}

const LAYOUTS = {
  "1600": screen({ left: 28, headRight: 383, companyLeft: 395, right: 836, top: 285, rowHeight: 53, controlHeight: 32 }),
  "1280": screen({ left: 28, headRight: 303, companyLeft: 315, right: 662, top: 285, rowHeight: 53, controlHeight: 32 }),
  "1280 veterans": screen({ left: 28, headRight: 303, companyLeft: 315, right: 662, top: 285, rowHeight: 62, controlHeight: 48 }),
};

describe.each(Object.entries(LAYOUTS))("the Posts and Company selection rings at %s", (_name, layout) => {
  const targets = columnTargets(layout.rows, layout.heads, layout.companies)!;
  const posts = ringOf(targets.posts);
  const selection = ringOf(targets.selection);

  it("share one height, matched to the post rows", () => {
    expect(posts.top).toBe(selection.top);
    expect(posts.bottom).toBe(selection.bottom);
    expect(posts.top).toBeLessThanOrEqual(Math.min(...layout.rows.map((row) => row.top)));
    expect(posts.bottom).toBeGreaterThanOrEqual(Math.max(...layout.rows.map((row) => row.bottom)));
  });

  it("do not overlap, and each still frames its own column", () => {
    expect(intersects(posts, selection)).toBe(false);
    expect(selection.left - posts.right).toBeGreaterThanOrEqual(4);
    expect(posts.left).toBeLessThanOrEqual(layout.heads[0].left);
    expect(selection.right).toBeGreaterThanOrEqual(layout.companies[0].right);
  });

  it("put each badge in its own ring's top-right corner, clear of the other ring and of the first row's controls", () => {
    const one = badgeRect(posts, "inside");
    const two = badgeRect(selection, "edge");
    // 1: inside the Posts ring's corner.
    expect(inside(one, posts)).toBe(true);
    expect(posts.right - one.right).toBeLessThan(12);
    expect(one.top - posts.top).toBeLessThan(12);
    // 2: on the selection ring's top border, within its width.
    expect(two.left).toBeGreaterThanOrEqual(selection.left);
    expect(two.right).toBeLessThanOrEqual(selection.right);
    expect(two.top).toBeLessThan(selection.top);
    expect(two.bottom).toBeGreaterThan(selection.top);
    // Neither touches the other ring, nor the first row's company control (its ✕ included).
    expect(intersects(one, selection)).toBe(false);
    expect(intersects(two, posts)).toBe(false);
    const firstControl = box(layout.companies[0].left, layout.companies[0].top, layout.rows[0].right, layout.companies[0].bottom);
    expect(intersects(two, firstControl)).toBe(false);
  });
});

describe("columnTargets", () => {
  it("has nothing to frame without rows", () => {
    expect(columnTargets([], [], [])).toBeNull();
  });
});
