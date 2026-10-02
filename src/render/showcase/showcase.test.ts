import { describe, expect, it } from "vitest";
import { useCaptureStore } from "../../app/captureStore";
import { islandPlacement } from "./CampaignMap";
import { placeholderBoard } from "./placeholderBoards";

describe("showcase", () => {
  it("lays the archipelago out left to right without overlaps", () => {
    const pts = [0, 1, 2, 3].map((i) => islandPlacement(i, 4));
    for (let i = 1; i < pts.length; i += 1) {
      expect(pts[i].x).toBeGreaterThan(pts[i - 1].x);
      expect(pts[i].distanceTo(pts[i - 1])).toBeGreaterThan(5.4); // two island radii
    }
  });

  it("lays out 6, 8 and 11 battles as a winding road in rows, no overlaps, in reach of the camera", async () => {
    const { archipelagoBounds, islandsPerRow, overviewFrame } = await import("./archipelagoLayout");
    for (const n of [6, 8, 11]) {
      const pts = Array.from({ length: n }, (_, i) => islandPlacement(i, n));
      // No two islands closer than two island radii (5.4).
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) expect(pts[i].distanceTo(pts[j]), `${n}: ${i}-${j}`).toBeGreaterThan(5.4);
      // Consecutive battles are neighbours (the road never jumps across the map).
      for (let i = 1; i < n; i += 1) expect(pts[i].distanceTo(pts[i - 1]), `${n}: step ${i}`).toBeLessThan(11); // a row step (8.2) plus the wave
      const b = archipelagoBounds(pts);
      expect(b.rows).toBe(Math.ceil(n / islandsPerRow(n)));
      expect(b.rows).toBeGreaterThan(1);
      expect(overviewFrame(b, 32, 1.6).dist).toBeLessThan(80);
    }
    expect([6, 8, 11].map(islandsPerRow)).toEqual([3, 4, 4]);
  });

  it("gives the highlighted campaign the focal (nearest, largest) slot and keeps the rest in order", async () => {
    const { clusterSlots, CLUSTER_SLOTS } = await import("./CampaignSelectBackdrop");
    expect(clusterSlots(["a", "b", "c"], null)).toEqual([0, 1, 2]);
    expect(clusterSlots(["a", "b", "c"], "c")).toEqual([1, 2, 0]);
    expect(clusterSlots(["a", "b"], "missing")).toEqual([0, 1]);
    // The focal slot is nearest (largest z) and largest; all slots sit right of centre-left.
    expect(CLUSTER_SLOTS[0][2]).toBe(Math.max(...CLUSTER_SLOTS.map((s) => s[2])));
    expect(CLUSTER_SLOTS[0][3]).toBe(Math.max(...CLUSTER_SLOTS.map((s) => s[3])));
    expect(Math.min(...CLUSTER_SLOTS.map((s) => s[0]))).toBeGreaterThan(0);
  });

  it("builds placeholder boards for unbuilt battles", () => {
    const marsh = placeholderBoard("saltmarsh");
    expect(marsh.hexes.some((h) => h.terrain === "ford")).toBe(true);
    const dawn = placeholderBoard("holdForDawn");
    expect(dawn.hexes.some((h) => h.terrain === "wall")).toBe(true);
    expect(dawn.hexes.filter((h) => h.objectiveId)).toHaveLength(1);
  });

  it("toggles capture mode", () => {
    expect(useCaptureStore.getState().captureMode).toBe(false);
    useCaptureStore.getState().setCaptureMode(true);
    expect(useCaptureStore.getState().captureMode).toBe(true);
    useCaptureStore.getState().setCaptureMode(false);
  });
});

describe("reduced motion setting", () => {
  it("resolves the Settings override against the OS preference", async () => {
    const { resolveReducedMotion } = await import("../motion");
    expect(resolveReducedMotion("system", true)).toBe(true);
    expect(resolveReducedMotion("system", false)).toBe(false);
    expect(resolveReducedMotion("reduce", false)).toBe(true);
    expect(resolveReducedMotion("full", true)).toBe(false);
  });
});

describe("time-of-day blend", () => {
  it("blends presets continuously and switches discrete fields at the midpoint", async () => {
    const { blendPresets } = await import("../look/blendPresets");
    const { emberDusk } = await import("../skins");
    const a = emberDusk.lighting.predawn;
    const b = emberDusk.lighting.sunrise;
    expect(blendPresets(a, b, 0)).toBe(a);
    expect(blendPresets(a, b, 1)).toBe(b);
    const mid = blendPresets(a, b, 0.5);
    expect(mid.sun.intensity).toBeCloseTo((a.sun.intensity + b.sun.intensity) / 2);
    expect(mid.exposure).toBeCloseTo((a.exposure + b.exposure) / 2);
    expect(mid.id).toBe("sunrise");
    expect(blendPresets(a, b, 0.25).id).toBe("predawn");
    expect(mid.sky.horizon).toMatch(/^#[0-9a-f]{6}$/);
  });
});
