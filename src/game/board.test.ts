import { describe, expect, it } from "vitest";
import {
  boardPixelBounds,
  getHex,
  hexPolygonPoints,
  hexToPixel,
  hexDistance,
  hexKey,
  hexNeighbors,
  isPassableTerrain,
  sameHex,
  terrainDefenseBonus,
  type BoardLayout,
  type TerrainType,
} from "./board";

const testBoard: BoardLayout = {
  width: 3,
  height: 3,
  hexes: [
    { coord: { q: 0, r: 0 }, terrain: "road", label: "Gate Road" },
    { coord: { q: 1, r: 0 }, terrain: "ridge", label: "North Ridge" },
    { coord: { q: 0, r: 1 }, terrain: "ford", label: "River Ford" },
    { coord: { q: -1, r: 1 }, terrain: "wall", objectiveId: "greyford_gate" },
  ],
};

describe("hex board model", () => {
  it("creates stable coordinate keys and compares hex coordinates by value", () => {
    expect(hexKey({ q: -1, r: 2 })).toBe("-1,2");
    expect(sameHex({ q: 2, r: -3 }, { q: 2, r: -3 })).toBe(true);
    expect(sameHex({ q: 2, r: -3 }, { q: 2, r: -2 })).toBe(false);
  });

  it("measures axial hex distance across each coordinate axis", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 2 })).toBe(2);
    expect(hexDistance({ q: -1, r: 1 }, { q: 2, r: -1 })).toBe(3);
  });

  it("returns the six adjacent axial neighbors around a coordinate", () => {
    expect(hexNeighbors({ q: 0, r: 0 })).toEqual([
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]);
  });

  it("looks up board hexes by coordinate", () => {
    expect(getHex(testBoard, { q: 1, r: 0 })).toMatchObject({
      terrain: "ridge",
      label: "North Ridge",
    });
    expect(getHex(testBoard, { q: 2, r: 2 })).toBeUndefined();
  });

  it("blocks movement through walls and deep river only", () => {
    expect(isPassableTerrain("river")).toBe(false);
    expect(isPassableTerrain("wall")).toBe(false);
    expect(isPassableTerrain("ford")).toBe(true);
  });

  it("defines a terrain defense bonus for every terrain type", () => {
    const expectedBonuses: Record<TerrainType, number> = {
      road: 0,
      ridge: 3,
      ford: -1,
      wall: 4,
      field: 0,
      ruin: 2,
      river: 0,
      marsh: -1,
      reeds: 1,
    };

    for (const [terrain, bonus] of Object.entries(expectedBonuses) as [TerrainType, number][]) {
      expect(terrainDefenseBonus(terrain)).toBe(bonus);
    }
  });

  it("projects axial coordinates to true flat-top tessellated centers", () => {
    const size = 10;
    const origin = hexToPixel({ q: 0, r: 0 }, size);
    const east = hexToPixel({ q: 1, r: 0 }, size);
    const southeast = hexToPixel({ q: 0, r: 1 }, size);

    expect(origin).toEqual({ x: 0, y: 0 });
    expect(east.x).toBeCloseTo(15);
    expect(east.y).toBeCloseTo(8.660254);
    expect(southeast.x).toBeCloseTo(0);
    expect(southeast.y).toBeCloseTo(17.320508);
  });

  it("creates flat-top hex polygons with shared-edge geometry", () => {
    const points = hexPolygonPoints({ x: 0, y: 0 }, 10);

    expect(points).toHaveLength(6);
    expect(points[1].y).toBeCloseTo(points[2].y);
    expect(points[4].y).toBeCloseTo(points[5].y);
    expect(points[0]).toEqual({ x: 10, y: 0 });
    expect(points[3]).toEqual({ x: -10, y: 0 });
  });

  it("computes board bounds from all rendered hex polygons", () => {
    const bounds = boardPixelBounds(testBoard, 10);

    expect(bounds.minX).toBeLessThan(0);
    expect(bounds.minY).toBeLessThan(0);
    expect(bounds.maxX).toBeGreaterThan(20);
    expect(bounds.maxY).toBeGreaterThan(20);
  });
});
