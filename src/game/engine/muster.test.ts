// The muster step and relief of the line (T21).
import { describe, expect, it } from "vitest";
import { boardNeighbors, hexDistance } from "../board";
import { playBattle } from "./balance";
import { eventsFor, visibleState } from "./fog";
import { applyMuster, heuristicMuster, MUSTER_HALTED, musterOptions, validateMuster } from "./muster";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { saltmarshColumn } from "./scenarios/saltmarshColumn";
import { kinds, library, openBoard, scenario, squad } from "./testKit";
import type { EngineScenario } from "./types";

const FB = "free_banners" as const;
const AH = "ashen_host" as const;

/** A 7x5 field: two companies and a cavalry troop on the right, the Host far left. */
const field = (overrides: Partial<EngineScenario> = {}) =>
  scenario({
    board: openBoard(7, 5, { "4,0": "wall", "3,4": "marsh" }),
    maxPhases: 2,
    squads: [
      squad("a", FB, { q: 5, r: 2 }),
      squad("b", FB, { q: 5, r: 3 }),
      squad("cav", FB, { q: 6, r: 0 }, { role: "cavalry" }),
      squad("h", AH, { q: 0, r: 2 }),
    ],
    ...overrides,
  });

describe("validateMuster", () => {
  it("lets a company out of contact move one hex (cavalry two), in order, once each", () => {
    const scen = field();
    const state = createInitialState(scen, { fortune: "off" });
    expect(validateMuster(state, scen, [{ squadId: "a", to: { q: 4, r: 2 } }])).toEqual({});
    expect(validateMuster(state, scen, [{ squadId: "cav", to: { q: 5, r: 1 } }])).toEqual({});
    expect(validateMuster(state, scen, [{ squadId: "a", to: { q: 3, r: 2 } }])).toEqual({ a: "Too far: a can muster 1 hex." });
    // The second move may use the hex the first one left.
    expect(validateMuster(state, scen, [{ squadId: "a", to: { q: 4, r: 2 } }, { squadId: "b", to: { q: 5, r: 2 } }])).toEqual({});
    expect(validateMuster(state, scen, [{ squadId: "a", to: { q: 4, r: 2 } }, { squadId: "a", to: { q: 4, r: 1 } }])).toEqual({
      a: "a has already mustered this phase.",
    });
  });

  it("explains every refusal in plain words", () => {
    const scen = field({
      objectives: [{ id: "gate", name: "Gate", description: "", hex: { q: 6, r: 2 }, integrity: 100, defender: FB }],
    });
    const state = createInitialState(scen, { fortune: "off" });
    const reason = (squadId: string, to: { q: number; r: number }) => validateMuster(state, scen, [{ squadId, to }])[squadId];
    expect(reason("a", { q: 5, r: 3 })).toBe("b already holds that hex.");
    expect(reason("a", { q: 6, r: 2 })).toBe("Gate cannot be garrisoned.");
    expect(reason("cav", { q: 4, r: 0 })).toBe("No company can stand on the wall.");
    expect(reason("a", { q: 9, r: 9 })).toBe("That hex is off the field.");
    expect(reason("h", { q: 1, r: 2 })).toBe("Only your own companies can muster.");
    expect(reason("ghost", { q: 1, r: 2 })).toBe("Only your own companies can muster.");
  });

  it("keeps companies in contact where they are, and marsh or an enemy's zone ends a cavalry muster", () => {
    const scen = field({
      squads: [
        squad("a", FB, { q: 3, r: 2 }),
        squad("cav", FB, { q: 3, r: 0 }, { role: "cavalry" }),
        squad("cav2", FB, { q: 4, r: 4 }, { role: "cavalry" }),
        squad("h", AH, { q: 2, r: 2 }),
      ],
    });
    const state = createInitialState(scen, { fortune: "off" });
    expect(validateMuster(state, scen, [{ squadId: "a", to: { q: 4, r: 2 } }])).toEqual({
      a: "a is in contact and cannot pull back. Relieve it instead.",
    });
    // An enemy's zone of control ends a muster: every two-hex muster goes through a free
    // hex outside the zone, and hexes inside the zone can still be the end of one.
    const cav = musterOptions(state, scen).find((item) => item.squadId === "cav")!;
    const enemy = { q: 2, r: 2 };
    const start = { q: 3, r: 0 };
    expect(cav.hexes.some((hex) => hexDistance(hex, enemy) === 1)).toBe(true);
    for (const hex of cav.hexes.filter((item) => hexDistance(item, start) === 2)) {
      const via = boardNeighbors(scen.board, start)
        .map((neighbour) => neighbour.coord)
        .filter((step) => hexDistance(step, hex) === 1 && hexDistance(step, enemy) > 1);
      expect(via.length, `${hex.q},${hex.r}`).toBeGreaterThan(0);
    }
    // Marsh ends a move: through (3,4) is no way on.
    const marsh = musterOptions(state, scen).find((item) => item.squadId === "cav2")!;
    expect(marsh.hexes).toContainEqual({ q: 3, r: 4 });
    expect(marsh.hexes).not.toContainEqual({ q: 2, r: 4 });
  });

  it("never moves the Column", () => {
    const state = createInitialState(saltmarshColumn);
    expect(validateMuster(state, saltmarshColumn, [{ squadId: "saltmarsh_column", to: { q: 3, r: 3 } }])).toEqual({
      saltmarsh_column: "The Column moves on its own orders.",
    });
    expect(musterOptions(state, saltmarshColumn).some((item) => item.squadId === "saltmarsh_column")).toBe(false);
  });
});

describe("relief of the line", () => {
  const line = () =>
    scenario({
      maxPhases: 2,
      squads: [
        squad("tired", FB, { q: 3, r: 2 }, { cohesion: 30 }),
        squad("fresh", FB, { q: 4, r: 2 }),
        squad("far", FB, { q: 6, r: 4 }),
        squad("h", AH, { q: 2, r: 2 }),
      ],
    });

  it("swaps a fresh company into an engaged one's place; the relieved one counts as mustered", () => {
    const scen = line();
    const state = createInitialState(scen, { fortune: "off" });
    expect(musterOptions(state, scen).find((item) => item.squadId === "fresh")?.relieve).toEqual(["tired"]);
    expect(validateMuster(state, scen, [{ squadId: "fresh", relieve: "tired" }])).toEqual({});
    expect(validateMuster(state, scen, [{ squadId: "fresh", relieve: "tired" }, { squadId: "tired", to: { q: 5, r: 2 } }])).toEqual({
      tired: "tired has already mustered this phase.",
    });

    const { state: after, events } = applyMuster(state, scen, [{ squadId: "fresh", relieve: "tired" }]);
    expect(after.squads.find((item) => item.id === "fresh")?.hex).toEqual({ q: 3, r: 2 });
    expect(after.squads.find((item) => item.id === "tired")?.hex).toEqual({ q: 4, r: 2 });
    expect(kinds(events)).toEqual(["relieved", "mustered", "mustered"]);
    expect(events[0]).toMatchObject({ kind: "relieved", squadId: "fresh", relievedId: "tired", hex: { q: 3, r: 2 } });
    expect(state.squads.find((item) => item.id === "fresh")?.hex).toEqual({ q: 4, r: 2 }); // pure
  });

  it("refuses a relief that is not one", () => {
    const scen = line();
    const state = createInitialState(scen, { fortune: "off" });
    expect(validateMuster(state, scen, [{ squadId: "far", relieve: "tired" }])).toEqual({ far: "far must stand next to tired to relieve it." });
    expect(validateMuster(state, scen, [{ squadId: "tired", relieve: "fresh" }])).toEqual({ tired: "tired is in contact itself and cannot relieve." });
    expect(validateMuster(state, scen, [{ squadId: "far", relieve: "fresh" }])).toEqual({ far: "fresh is not in contact: muster it instead." });
    expect(validateMuster(state, scen, [{ squadId: "fresh", relieve: "h" }])).toEqual({ fresh: "Only one of your companies in the line can be relieved." });
  });
});

describe("muster under fog", () => {
  // Before dawn the Banners see one hex: the Host at (2,2), two hexes off, is hidden.
  const fog = () =>
    scenario({
      maxPhases: 2,
      timeOfDay: "predawn",
      squads: [squad("cav", FB, { q: 4, r: 2 }, { role: "cavalry" }), squad("h", AH, { q: 2, r: 2 })],
    });

  it("judges by what the side sees: an unseen enemy's hex looks free and no reason names it", () => {
    const scen = fog();
    const state = createInitialState(scen, { fortune: "on", seed: 1 });
    expect(visibleState(state, FB).squads.some((item) => item.id === "h")).toBe(false);
    expect(validateMuster(state, scen, [{ squadId: "cav", to: { q: 2, r: 2 } }])).toEqual({});
    expect(musterOptions(state, scen)[0].hexes).toContainEqual({ q: 2, r: 2 });
  });

  it("applies on the truth: the company halts short of what it could not see, with a neutral reason", () => {
    const scen = fog();
    const state = createInitialState(scen, { fortune: "on", seed: 1 });
    const { state: after, events } = applyMuster(state, scen, [{ squadId: "cav", to: { q: 2, r: 2 } }]);
    const cav = after.squads.find((item) => item.id === "cav")!;
    expect(hexDistance(cav.hex!, { q: 2, r: 2 })).toBe(1);
    expect(events.at(-1)).toMatchObject({ kind: "mustered", squadId: "cav", halted: true });
    const { events: stuck } = applyMuster(state, scen, [{ squadId: "cav", to: { q: 3, r: 2 } }]);
    expect(stuck.every((event) => event.kind !== "blocked" || event.reason === MUSTER_HALTED)).toBe(true);
    expect(JSON.stringify(events)).not.toContain('"h"');
  });
});

describe("muster in a phase", () => {
  it("musters at beat 0, before the Host acts, and plays the same every time", () => {
    const scen = scenario({
      maxPhases: 2,
      squads: [squad("a", FB, { q: 5, r: 2 }), squad("h", AH, { q: 0, r: 2 })],
    });
    const state = createInitialState(scen, { fortune: "off" });
    const result = resolvePhase(state, {}, scen, { doctrines: library(), muster: [{ squadId: "a", to: { q: 4, r: 2 } }] });
    expect(result.events[0]).toMatchObject({ kind: "mustered", squadId: "a", beat: 0, from: { q: 5, r: 2 }, to: { q: 4, r: 2 } });
    expect(result.state.squads.find((item) => item.id === "a")?.hex).toEqual({ q: 4, r: 2 });
    expect(eventsFor(result.events, FB)[0]).toMatchObject({ kind: "mustered" });
    expect(resolvePhase(state, {}, scen, { doctrines: library(), muster: [{ squadId: "a", to: { q: 4, r: 2 } }] })).toEqual(result);
    expect(() => resolvePhase(state, {}, scen, { doctrines: library(), muster: [{ squadId: "a", to: { q: 2, r: 2 } }] })).toThrow(
      /Invalid muster for a: Too far/,
    );
  });
});

describe("the harness's muster", () => {
  it("relieves a worn company with a fresh neighbour and closes idle companies on the fight", () => {
    const scen = scenario({
      maxPhases: 2,
      board: openBoard(9, 5),
      squads: [
        squad("worn", FB, { q: 3, r: 2 }, { cohesion: 30 }),
        squad("fresh", FB, { q: 4, r: 2 }, { cohesion: 80 }),
        squad("idle", FB, { q: 8, r: 4 }),
        squad("h", AH, { q: 2, r: 2 }),
      ],
    });
    const state = createInitialState(scen, { fortune: "off" });
    const moves = heuristicMuster(state, scen);
    expect(moves).toContainEqual({ squadId: "fresh", relieve: "worn" });
    const idle = moves.find((move) => move.squadId === "idle");
    expect(idle && "to" in idle && hexDistance(idle.to, { q: 2, r: 2 })).toBeLessThan(hexDistance({ q: 8, r: 4 }, { q: 2, r: 2 }));
    expect(validateMuster(state, scen, moves)).toEqual({});
  });

  it("is a legal muster in every battle, every phase (it reads only the player's view)", () => {
    for (const seed of [1, 2, 3]) {
      expect(() => playBattle(saltmarshColumn, saltmarshColumn.referencePlans!.intended, seed, "on", "heuristic")).not.toThrow();
    }
  });
});
