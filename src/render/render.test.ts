import { describe, expect, it } from "vitest";
import { firstBreach as firstBreachScenario } from "../game/engine/scenarios/firstBreach";
import { hexKey } from "../game/board";
import { boardCenter, hexToWorld, islandShore } from "./hexWorld";
import { SKINS, getSkin, isTimeOfDay, TIME_OF_DAY_KEYS } from "./skins";
import { cohesionArc, figureCount, formationSlots } from "./squadLayout";

const board = firstBreachScenario.board;

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
      for (const terrain of ["road", "ridge", "ford", "wall", "field", "ruin", "river"] as const) {
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

describe("engine mapping", () => {
  it("maps engine scenarios to diorama squads and lighting", async () => {
    const { dioramaSquads, lightingFor } = await import("./fromEngine");
    const { emberFord } = await import("../game/engine/scenarios/emberFord");
    const squads = dioramaSquads(emberFord.squads);
    expect(squads).toHaveLength(emberFord.squads.length);
    expect(squads.find((s) => s.id === "pyre_sworn")?.renowned).toBe(true);
    expect(squads.find((s) => s.faction === "free_banners")?.facing).toBeCloseTo(Math.PI);
    expect(lightingFor(emberFord.timeOfDay)).toBe("nightFires");
    expect(lightingFor(undefined)).toBe("dusk");
  });
});

describe("fog adapter", () => {
  it("derives visible hexes and ghosts from a VisibleState-like view", async () => {
    const { visibilityFromView, dioramaSquads } = await import("./fromEngine");
    const view = {
      viewer: "free_banners" as const,
      fortune: "on" as const,
      weather: "clear" as const,
      squads: [
        { id: "a", faction: "free_banners" as const, hex: { q: 3, r: 2 }, status: "active", strength: 80, cohesion: 70, lastKnown: false },
        { id: "g", faction: "ashen_host" as const, hex: { q: 0, r: 0 }, status: "active", strength: 60, cohesion: 50, lastKnown: true },
      ],
    };
    const vis = visibilityFromView(view, { board })!;
    const keys = new Set(vis.visibleHexes.map((h) => `${h.q},${h.r}`));
    expect(keys.has("3,2")).toBe(true);
    expect(keys.has("1,2")).toBe(true); // 2 hexes away
    expect(keys.has("0,0")).toBe(false);
    expect(vis.lastKnown).toEqual([{ squadId: "g", hex: { q: 0, r: 0 }, faction: "ashen_host", strength: 60, cohesion: 50 }]);
    // Mist shortens sight; fortune off means no fog at all.
    const misty = visibilityFromView({ ...view, weather: "mist" }, { board })!;
    expect(new Set(misty.visibleHexes.map((h) => `${h.q},${h.r}`)).has("1,2")).toBe(false);
    expect(visibilityFromView({ ...view, fortune: "off" }, { board })).toBeUndefined();
    // Ghost flag survives the squad mapper.
    expect(dioramaSquads(view.squads.map((s) => ({ ...s, hex: s.hex! }))).find((s) => s.id === "g")?.lastKnown).toBe(true);
  });
});
