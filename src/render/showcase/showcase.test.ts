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
