import { describe, expect, it } from "vitest";
import { firstBreachScenario } from "../game/scenario";
import { readabilityScenario } from "../game/readabilityScenario";
import { boardCenter, hexToWorld } from "./hexWorld";
import { pickBoardHex, resolveClick, roundAxial, sameHexOrNull, squadAtHex, worldToHex } from "./picking";

const board = firstBreachScenario.board!;
const center = boardCenter(board);

describe("picking", () => {
  it("round-trips every hex centre through world space", () => {
    for (const layout of [board, readabilityScenario.board!]) {
      const c = boardCenter(layout);
      for (const hex of layout.hexes) {
        const [x, z] = hexToWorld(hex.coord, c);
        expect(worldToHex(x, z, c)).toEqual(hex.coord);
      }
    }
  });

  it("picks the right hex anywhere inside it, including near edges", () => {
    const [x, z] = hexToWorld({ q: 2, r: 2 }, center);
    for (let a = 0; a < 12; a += 1) {
      const ang = (a / 12) * Math.PI * 2;
      // Inside the inscribed circle (apothem ≈ 0.866) the answer is unambiguous.
      expect(worldToHex(x + Math.cos(ang) * 0.8, z + Math.sin(ang) * 0.8, center)).toEqual({ q: 2, r: 2 });
    }
  });

  it("returns null off the board", () => {
    const [x, z] = hexToWorld({ q: -1, r: 2 }, center);
    expect(pickBoardHex({ x, z }, board, center)).toBeNull();
    expect(pickBoardHex({ x: 999, z: 999 }, board, center)).toBeNull();
    const [gx, gz] = hexToWorld({ q: 4, r: 2 }, center);
    expect(pickBoardHex({ x: gx, z: gz }, board, center)).toEqual({ q: 4, r: 2 });
  });

  it("maps clicks to squads", () => {
    const squads = firstBreachScenario.squads.map((s) => ({ id: s.id, hex: s.hex! }));
    expect(squadAtHex({ q: 3, r: 2 }, squads)).toBe("greyford_shields");
    expect(resolveClick({ q: 0, r: 0 }, squads)).toEqual({ hex: { q: 0, r: 0 }, squadId: null });
    expect(resolveClick({ q: 1, r: 2 }, squads).squadId).toBe("cinder_vanguard");
    expect(resolveClick(null, squads)).toEqual({ hex: null, squadId: null });
  });

  it("rounds cube coordinates without negative zero", () => {
    expect(roundAxial(-0.2, 0.1)).toEqual({ q: 0, r: 0 });
    expect(Object.is(roundAxial(-0.2, 0.1).q, -0)).toBe(false);
    expect(sameHexOrNull({ q: 1, r: 1 }, { q: 1, r: 1 })).toBe(true);
    expect(sameHexOrNull(null, { q: 1, r: 1 })).toBe(false);
  });
});
