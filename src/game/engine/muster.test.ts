// The muster step and relief of the line (T21).
import { describe, expect, it } from "vitest";
import { boardNeighbors, hexDistance } from "../board";
import { playBattle } from "./balance";
import { eventsFor, visibleState } from "./fog";
import { applyMuster, heuristicMuster, MUSTER_HALTED, musterOptions, validateMuster } from "./muster";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { createRng } from "./rng";
import { scenarios } from "./scenarios";
import { saltmarshColumn } from "./scenarios/saltmarshColumn";
import { kinds, library, openBoard, scenario, squad } from "./testKit";
import type { EngineScenario, EngineState } from "./types";
import type { EventBody } from "./context";
import type { MusterMove } from "./muster";

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

  it("a later move that counted on a hex an earlier one never reached is barred, not lost (review)", () => {
    // The cavalry plans (4,2) -> (2,2) through (3,2); the company at (3,3) plans to take (3,2)
    // once it is clear. The cavalry halts at (3,2) on the unseen Host's zone of control.
    const scen = scenario({
      maxPhases: 2,
      timeOfDay: "predawn",
      squads: [squad("cav", FB, { q: 4, r: 2 }, { role: "cavalry" }), squad("foot", FB, { q: 3, r: 3 }), squad("h", AH, { q: 2, r: 2 })],
    });
    const state = createInitialState(scen, { fortune: "on", seed: 1 });
    const moves: MusterMove[] = [
      { squadId: "cav", to: { q: 2, r: 2 } },
      { squadId: "foot", to: { q: 3, r: 2 } },
    ];
    expect(validateMuster(state, scen, moves)).toEqual({});
    const { state: after, events } = applyMuster(state, scen, moves);
    expect(after.squads.find((item) => item.id === "cav")?.hex).toEqual({ q: 3, r: 2 });
    expect(after.squads.find((item) => item.id === "foot")?.hex).toEqual({ q: 3, r: 3 });
    expect(events).toEqual([
      { kind: "mustered", squadId: "cav", path: [{ q: 4, r: 2 }, { q: 3, r: 2 }], from: { q: 4, r: 2 }, to: { q: 3, r: 2 }, halted: true },
      { kind: "blocked", squadId: "foot", reason: MUSTER_HALTED },
    ]);
  });
});

/** Every planned move yields exactly one outcome for its company: `mustered` (with `relieved` first for a relief) or `blocked`. */
function outcomesFor(events: EventBody[], moves: MusterMove[]) {
  return moves.map((move) => {
    const own = events.filter((event) => (event.kind === "mustered" || event.kind === "blocked" || event.kind === "relieved") && event.squadId === move.squadId);
    return own.map((event) => event.kind).join("+");
  });
}

/** A random muster the player could have planned: options and reliefs from its own view, kept only while valid. */
function randomMuster(state: EngineState, scen: EngineScenario, seed: number): MusterMove[] {
  const rng = createRng(seed);
  const moves: MusterMove[] = [];
  for (const option of musterOptions(state, scen)) {
    const roll = rng.next();
    const pick =
      option.relieve.length > 0 && roll < 0.3
        ? { squadId: option.squadId, relieve: option.relieve[Math.floor(rng.next() * option.relieve.length)] }
        : option.hexes.length > 0 && roll < 0.8
          ? { squadId: option.squadId, to: option.hexes[Math.floor(rng.next() * option.hexes.length)] }
          : null;
    if (pick && Object.keys(validateMuster(state, scen, [...moves, pick])).length === 0) moves.push(pick);
  }
  return moves;
}

describe("muster outcomes (property)", () => {
  it("every planned muster move yields exactly one mustered or blocked event, in every battle and phase", () => {
    let planned = 0;
    let barred = 0;
    for (const scen of scenarios) {
      for (const seed of [1, 2, 3, 4]) {
        let state = createInitialState(scen, { seed, fortune: "on" });
        while (state.status === "command") {
          const moves = randomMuster(state, scen, seed * 100 + state.phase);
          const { events } = applyMuster(state, scen, moves);
          outcomesFor(events, moves).forEach((outcome, index) => {
            expect(["mustered", "blocked", "relieved+mustered"], `${scen.id}#${seed} P${state.phase} ${JSON.stringify(moves[index])}`).toContain(outcome);
          });
          for (const event of events) {
            if (event.kind === "blocked") expect(event.reason).toBe(MUSTER_HALTED);
          }
          planned += moves.length;
          barred += events.filter((event) => event.kind === "blocked").length;
          state = resolvePhase(state, scen.referencePlans!.intended, scen, { muster: moves }).state;
        }
      }
    }
    expect(planned).toBeGreaterThan(50);
    void barred;
  }, 60_000);

  it("holds in the dark too, where unseen enemies cut planned moves short", () => {
    let planned = 0;
    let barred = 0;
    let halted = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      // A dark field: the Banners see one hex; four Host companies hide at random in the middle.
      const rng = createRng(seed);
      const taken = new Set(["5,1", "5,2", "5,3", "6,2"]);
      const host = Array.from({ length: 4 }, (_, index) => {
        let hex = { q: 0, r: 0 };
        do hex = { q: 1 + Math.floor(rng.next() * 3), r: Math.floor(rng.next() * 5) };
        while (taken.has(`${hex.q},${hex.r}`));
        taken.add(`${hex.q},${hex.r}`);
        return squad(`h${index}`, AH, hex);
      });
      const scen = scenario({
        maxPhases: 2,
        timeOfDay: "predawn",
        squads: [
          squad("cav", FB, { q: 5, r: 2 }, { role: "cavalry" }),
          squad("a", FB, { q: 5, r: 1 }),
          squad("b", FB, { q: 5, r: 3 }),
          squad("lance", FB, { q: 6, r: 2 }, { role: "cavalry" }),
          ...host,
        ],
      });
      const state = createInitialState(scen, { seed, fortune: "on" });
      const moves = randomMuster(state, scen, seed);
      const { events } = applyMuster(state, scen, moves);
      outcomesFor(events, moves).forEach((outcome, index) => {
        expect(["mustered", "blocked", "relieved+mustered"], `#${seed} ${JSON.stringify(moves[index])}`).toContain(outcome);
      });
      for (const event of events) {
        if (event.kind === "blocked") expect(event.reason).toBe(MUSTER_HALTED);
      }
      // Fog-safe: nothing the Banners could not see is named.
      for (const event of events) expect(JSON.stringify(event)).not.toMatch(/"h\d"/);
      planned += moves.length;
      barred += events.filter((event) => event.kind === "blocked").length;
      halted += events.filter((event) => event.kind === "mustered" && event.halted).length;
    }
    expect(planned).toBeGreaterThan(200);
    // The property is exercised: unseen enemies do halt and bar planned moves here.
    expect(halted).toBeGreaterThan(0);
    expect(barred).toBeGreaterThan(0);
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
