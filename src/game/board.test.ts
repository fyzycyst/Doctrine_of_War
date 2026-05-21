import { describe, expect, it } from "vitest";
import {
  getHex,
  hexDistance,
  hexKey,
  hexNeighbors,
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

  it("defines a terrain defense bonus for every terrain type", () => {
    const expectedBonuses: Record<TerrainType, number> = {
      road: 0,
      ridge: 3,
      ford: -1,
      wall: 4,
      field: 0,
      ruin: 2,
    };

    for (const [terrain, bonus] of Object.entries(expectedBonuses) as [TerrainType, number][]) {
      expect(terrainDefenseBonus(terrain)).toBe(bonus);
    }
  });
});
