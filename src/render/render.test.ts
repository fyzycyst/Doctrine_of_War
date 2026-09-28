import { describe, expect, it } from "vitest";
import { firstBreachScenario } from "../game/scenario";
import { hexKey } from "../game/board";
import { boardCenter, hexToWorld, islandShore } from "./hexWorld";
import { SKINS, getSkin, isTimeOfDay, TIME_OF_DAY_KEYS } from "./skins";
import { cohesionArc, figureCount, formationSlots } from "./squadLayout";

const board = firstBreachScenario.board!;

describe("squad layout", () => {
  it("maps strength to 1..9 figures and falls with strength", () => {
    expect(figureCount(100)).toBe(9);
    expect(figureCount(70)).toBe(7);
    expect(figureCount(38)).toBe(4);
    expect(figureCount(1)).toBe(1);
    expect(figureCount(0)).toBe(0);
    for (let s = 1; s < 100; s += 1) {
      expect(figureCount(s + 1)).toBeGreaterThanOrEqual(figureCount(s));
    }
  });

  it("returns exactly the requested number of distinct slots", () => {
    for (let n = 0; n <= 9; n += 1) {
      const slots = formationSlots(n, 42);
      expect(slots).toHaveLength(n);
      const keys = new Set(slots.map((s) => `${s.forward.toFixed(4)}:${s.side.toFixed(4)}`));
      expect(keys.size).toBe(n);
    }
  });

  it("is deterministic per seed and keeps figures inside the hex", () => {
    expect(formationSlots(6, 7)).toEqual(formationSlots(6, 7));
    for (const slot of formationSlots(9, 3)) {
      expect(Math.hypot(slot.forward, slot.side)).toBeLessThan(0.75);
    }
  });

  it("computes the cohesion ring gap", () => {
    expect(cohesionArc(100)).toEqual({ lit: 1, gap: 0 });
    expect(cohesionArc(30).gap).toBeCloseTo(0.7);
    expect(cohesionArc(-5).lit).toBe(0);
  });
});

describe("island geometry", () => {
  it("centres the board on the origin", () => {
    const center = boardCenter(board);
    const xs = board.hexes.map((hex) => hexToWorld(hex.coord, center)[0]);
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeCloseTo(0);
  });

  it("builds a shore that never overlaps the board and fully rings it", () => {
    const shore = islandShore(board);
    const boardKeys = new Set(board.hexes.map((hex) => hexKey(hex.coord)));
    expect(shore.some((s) => boardKeys.has(hexKey(s.coord)))).toBe(false);
    // A 5×5 axial rhombus has 4×5 edge neighbours plus 2 at its obtuse corners.
    expect(shore.filter((s) => s.ring === 1)).toHaveLength(22);
  });
});

describe("skins", () => {
  it("every skin defines every lighting preset and every terrain type", () => {
    for (const skin of Object.values(SKINS)) {
      for (const key of TIME_OF_DAY_KEYS) {
        expect(skin.lighting[key].id).toBe(key);
      }
      for (const terrain of ["road", "ridge", "ford", "wall", "field", "ruin"] as const) {
        expect(skin.terrain[terrain].top).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("falls back to Ember Dusk and validates time-of-day keys", () => {
    expect(getSkin("nope").id).toBe("emberDusk");
    expect(isTimeOfDay("sunrise")).toBe(true);
    expect(isTimeOfDay("noon")).toBe(false);
  });
});
