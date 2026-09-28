import { describe, expect, it } from "vitest";
import { evaluateOutcome } from "./outcome";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { firstBreach } from "./scenarios/firstBreach";
import { doctrine, library, scenario, squad } from "./testKit";
import type { EngineEvent, EngineScenario, ObjectiveSetup } from "./types";

const FB = "free_banners" as const;
const AH = "ashen_host" as const;

const fired = (events: EngineEvent[]) =>
  events.filter((event) => event.kind === "ruleFired").map((event) => `${event.beat}:${"squadId" in event ? event.squadId : ""}`);

function run(scen: EngineScenario, orders: Record<string, string> = {}, doctrines = library()) {
  return resolvePhase(createInitialState(scen), orders, scen, { doctrines });
}

describe("beat model", () => {
  it("runs 3 beats; the initiative side acts first each beat, in squad list order", () => {
    const scen = scenario({
      squads: [
        squad("p1", FB, { q: 5, r: 0 }),
        squad("h1", AH, { q: 0, r: 0 }),
        squad("p2", FB, { q: 5, r: 4 }),
        squad("h2", AH, { q: 0, r: 4 }),
      ],
      maxPhases: 2,
    });
    const { events, state } = run(scen);
    expect(fired(events)).toEqual([
      "1:h1", "1:h2", "1:p1", "1:p2",
      "2:h1", "2:h2", "2:p1", "2:p2",
      "3:h1", "3:h2", "3:p1", "3:p2",
    ]);
    expect(state.phase).toBe(2);
    expect(state.status).toBe("command");
  });

  it("honours a scenario where the player side has the initiative", () => {
    const scen = scenario({
      initiativeSide: FB,
      squads: [squad("h1", AH, { q: 0, r: 0 }), squad("p1", FB, { q: 5, r: 0 })],
      maxPhases: 2,
    });
    expect(fired(run(scen).events).slice(0, 2)).toEqual(["1:p1", "1:h1"]);
  });

  it("later squads see the results of earlier activations in the same beat", () => {
    const hunter = doctrine("hunter", AH, [
      [{ kind: "enemyAdjacent" }, { kind: "attack", target: { kind: "nearestEnemy" } }],
      [{ kind: "always" }, { kind: "hold" }],
    ]);
    const scen = scenario({
      squads: [
        squad("h1", AH, { q: 1, r: 2 }, { doctrineId: "hunter", strength: 100 }),
        squad("p1", FB, { q: 2, r: 2 }, { cohesion: 2 }),
        squad("p2", FB, { q: 5, r: 0 }),
      ],
      maxPhases: 2,
    });
    const { events } = run(scen, {}, library(hunter));
    // p1 routs in h1's activation, so it never acts.
    expect(fired(events)).not.toContain("1:p1");
    expect(events.find((event) => event.kind === "rout")).toMatchObject({ squadId: "p1", beat: 1 });
  });

  it("stamps every event with phase and beat", () => {
    const { events } = run(scenario({ squads: [squad("p", FB, { q: 5, r: 0 }), squad("h", AH, { q: 0, r: 0 })], maxPhases: 2 }));
    expect(events.every((event) => event.phase === 1 && event.beat >= 1 && event.beat <= 3)).toBe(true);
  });

  it("a hold braces the squad until its next activation, including across phases", () => {
    const scen = scenario({ squads: [squad("p", FB, { q: 5, r: 0 }), squad("h", AH, { q: 0, r: 0 })], maxPhases: 2 });
    const { state } = run(scen);
    expect(state.squads.every((item) => item.braced)).toBe(true);
  });
});

describe("resolvePhase contract", () => {
  const scen = scenario({
    squads: [squad("p", FB, { q: 4, r: 2 }), squad("h", AH, { q: 1, r: 2 }, { doctrineId: "iron_tide" })],
    maxPhases: 3,
  });

  it("does not mutate its input state", () => {
    const input = createInitialState(scen);
    const snapshot = structuredClone(input);
    resolvePhase(input, {}, scen, { doctrines: library() });
    expect(input).toEqual(snapshot);
  });

  it("is deterministic for the same inputs", () => {
    const a = run(scen);
    const b = run(scen);
    expect(a).toEqual(b);
  });

  it("with fortune off, never advances the rng and the seed does not matter", () => {
    const seeded = (seed: number) => createInitialState(scen, { seed, fortune: "off" });
    const withSeedA = resolvePhase(seeded(12345), {}, scen, { doctrines: library() });
    expect(withSeedA.state.rngState).toBe(12345);
    const withSeedB = resolvePhase(seeded(999), {}, scen, { doctrines: library() });
    const strip = (result: typeof withSeedA) => ({
      ...result,
      state: { ...result.state, seed: 0, rngState: 0 },
      report: { ...result.report, seed: 0 },
    });
    expect(strip(withSeedA)).toEqual(strip(withSeedB));
  });

  it("defaults to fortune off with seed 1", () => {
    const state = createInitialState(scen);
    expect(state).toMatchObject({ fortune: "off", seed: 1, rngState: 1, weather: "clear", intel: {} });
  });

  it("applies player orders and rejects invalid ones", () => {
    const { state } = run(scen, { p: "shield_the_line" });
    expect(state.squads.find((item) => item.id === "p")?.doctrineId).toBe("shield_the_line");
    expect(() => run(scen, { p: "iron_tide" })).toThrow(/Invalid player order/);
    expect(() => run(scen, { h: "iron_tide" })).toThrow(/Invalid player order/);
    expect(() => run(scen, { p: "no_such_doctrine" })).toThrow(/Invalid player order/);
    expect(() => run(scen, { ghost: "shield_the_line" })).toThrow(/Invalid player order/);
  });

  it("only accepts player doctrines from the scenario's list", () => {
    const limited = scenario({ ...scen, playerDoctrineIds: ["shield_the_line"] });
    expect(() => run(limited, { p: "shield_the_line" })).not.toThrow();
    expect(() => run(limited, { p: "hold_for_dawn" })).toThrow(/hold_for_dawn is not available in this scenario/);
  });

  it("applies the host schedule for the current phase; unlisted squads keep their doctrine", () => {
    const scheduled = scenario({
      ...scen,
      squads: [...scen.squads, squad("h2", AH, { q: 0, r: 0 }, { doctrineId: "no_step_back" })],
      hostSchedule: [
        { phase: 1, intent: "Test intent.", orders: { h: "cull_the_weak" } },
        { phase: 2, intent: "Second.", orders: { h: "terror_push" } },
      ],
    });
    const first = run(scheduled);
    expect(first.state.squads.find((item) => item.id === "h")?.doctrineId).toBe("cull_the_weak");
    expect(first.state.squads.find((item) => item.id === "h2")?.doctrineId).toBe("no_step_back");
    expect(first.report.title).toBe("Phase 1: Test intent.");
    const second = resolvePhase(first.state, {}, scheduled, { doctrines: library() });
    expect(second.state.squads.find((item) => item.id === "h")?.doctrineId).toBe("terror_push");
    expect(() =>
      run(scenario({ ...scheduled, hostSchedule: [{ phase: 1, intent: "", orders: { h: "shield_the_line" } }] })),
    ).toThrow(/Invalid host schedule order/);
  });

  it("refuses to resolve a battle that is already over", () => {
    const over = { ...createInitialState(scen), status: "defeat" as const };
    expect(() => resolvePhase(over, {}, scen)).toThrow(/already over/);
  });

  it("produces prose report lines from the events", () => {
    const { report, events } = run(scen);
    expect(report.phase).toBe(1);
    expect(report.lines.length).toBe(events.length);
    expect(report.lines[0]).toMatch(/^Beat 1\. h: "/);
  });
});

describe("win conditions", () => {
  const gate: ObjectiveSetup = { id: "gate", name: "Gate", description: "", hex: { q: 5, r: 2 }, integrity: 20, defender: FB };

  it("holdObjective: defeat the moment integrity hits 0, stopping the phase", () => {
    const scen = scenario({
      objectives: [gate],
      winCondition: { kind: "holdObjective", objectiveId: "gate" },
      squads: [
        squad("h", AH, { q: 4, r: 2 }, { doctrineId: "break_the_gate", role: "siege", strength: 100 }),
        squad("p", FB, { q: 0, r: 0 }),
      ],
    });
    const { state, events } = run(scen);
    expect(state.status).toBe("defeat");
    expect(state.objectives[0].integrity).toBe(0);
    expect(events.at(-1)).toMatchObject({ kind: "outcome", status: "defeat", beat: 1 });
    // The player squad never activated: the battle ended in the Host's first activation.
    expect(fired(events)).toEqual(["1:h"]);
  });

  it("holdObjective: victory when the objective survives the last phase", () => {
    const scen = scenario({
      objectives: [gate],
      winCondition: { kind: "holdObjective", objectiveId: "gate" },
      squads: [squad("h", AH, { q: 0, r: 0 }), squad("p", FB, { q: 3, r: 0 })],
    });
    const { state, events, report } = run(scen);
    expect(state.status).toBe("victory");
    expect(events.at(-1)).toMatchObject({ kind: "outcome", status: "victory", beat: 0 });
    expect(report.status).toBe("victory");
    expect(report.lines.at(-1)).toMatch(/^Victory/);
  });

  it("escapeEdge: squads that reach an edge hex exit; enough exits is victory", () => {
    const runner = doctrine("runner", FB, [[{ kind: "always" }, { kind: "advance", toward: { kind: "exitEdge" } }]]);
    const scen = scenario({
      winCondition: { kind: "escapeEdge", edgeHexes: [{ q: 6, r: 0 }, { q: 6, r: 1 }], count: 2 },
      squads: [
        squad("a", FB, { q: 4, r: 0 }, { doctrineId: "runner" }),
        squad("b", FB, { q: 5, r: 1 }, { doctrineId: "runner" }),
        squad("h", AH, { q: 0, r: 4 }),
      ],
    });
    const { state, events } = run(scen, {}, library(runner));
    expect(events.filter((event) => event.kind === "exit").map((event) => ("squadId" in event ? event.squadId : ""))).toEqual(["b", "a"]);
    expect(state.squads.filter((item) => item.status === "escaped")).toHaveLength(2);
    expect(state.status).toBe("victory");
  });

  it("escapeEdge: defeat when time runs out", () => {
    const scen = scenario({
      winCondition: { kind: "escapeEdge", edgeHexes: [{ q: 6, r: 0 }], count: 1 },
      squads: [squad("a", FB, { q: 0, r: 4 }), squad("h", AH, { q: 0, r: 0 })],
    });
    expect(run(scen).state.status).toBe("defeat");
  });

  it("destroySquads: victory once every target is routed or destroyed", () => {
    const striker = doctrine("striker", FB, [[{ kind: "always" }, { kind: "attack", target: { kind: "nearestEnemy" } }]]);
    const scen = scenario({
      initiativeSide: FB,
      winCondition: { kind: "destroySquads", squadIds: ["h"] },
      squads: [
        squad("p", FB, { q: 1, r: 2 }, { doctrineId: "striker", strength: 100 }),
        squad("h", AH, { q: 2, r: 2 }, { cohesion: 3 }),
        squad("h2", AH, { q: 6, r: 4 }),
      ],
    });
    const { state, events } = run(scen, {}, library(striker));
    expect(state.status).toBe("victory");
    expect(events.at(-1)).toMatchObject({ kind: "outcome", status: "victory", beat: 1 });
  });

  it("destroySquads: rejects empty, missing and mixed target lists at battle start", () => {
    const withTargets = (squadIds: string[]) =>
      scenario({
        winCondition: { kind: "destroySquads", squadIds },
        squads: [squad("p", FB, { q: 6, r: 4 }), squad("h", AH, { q: 0, r: 0 })],
      });
    expect(() => createInitialState(withTargets([]))).toThrow(/at least one target/);
    expect(() => createInitialState(withTargets(["h", "ghost"]))).toThrow(/ghost does not exist/);
    expect(() => createInitialState(withTargets(["h", "p"]))).toThrow(/p is a player squad/);
    expect(() => createInitialState(withTargets(["h"]))).not.toThrow();
  });

  it("destroySquads: evaluates the requested ids, so a missing id can never count as broken", () => {
    const scen = scenario({
      winCondition: { kind: "destroySquads", squadIds: ["h"] },
      squads: [squad("p", FB, { q: 6, r: 4 }), squad("h", AH, { q: 0, r: 0 })],
    });
    const state = createInitialState(scen);
    const drifted = { ...scen, winCondition: { kind: "destroySquads" as const, squadIds: ["ghost"] } };
    expect(evaluateOutcome(state, drifted, false)).toBeNull();
    expect(evaluateOutcome(state, { ...scen, winCondition: { kind: "destroySquads", squadIds: [] } }, false)).toBeNull();
  });

  it("timeoutOutcome stalemate: running out of phases is a stalemate, not a defeat", () => {
    const scen = scenario({
      winCondition: { kind: "destroySquads", squadIds: ["h"] },
      timeoutOutcome: "stalemate",
      squads: [squad("p", FB, { q: 6, r: 4 }), squad("h", AH, { q: 0, r: 0 })],
    });
    const { state, events, report } = run(scen);
    expect(state.status).toBe("stalemate");
    expect(events.at(-1)).toMatchObject({ kind: "outcome", status: "stalemate", beat: 0 });
    expect(report.lines.at(-1)).toMatch(/^Stalemate/);
    expect(() => resolvePhase(state, {}, scen)).toThrow(/already over/);
  });

  it("timeoutOutcome never softens a real defeat or a hold-the-line victory", () => {
    const gateScen = scenario({
      objectives: [gate],
      winCondition: { kind: "holdObjective", objectiveId: "gate" },
      timeoutOutcome: "stalemate",
      squads: [squad("h", AH, { q: 0, r: 0 }), squad("p", FB, { q: 3, r: 0 })],
    });
    expect(run(gateScen).state.status).toBe("victory");
  });

  it("destroySquads: defeat when time runs out", () => {
    const scen = scenario({
      winCondition: { kind: "destroySquads", squadIds: ["h"] },
      squads: [squad("p", FB, { q: 6, r: 4 }), squad("h", AH, { q: 0, r: 0 })],
    });
    expect(run(scen).state.status).toBe("defeat");
  });

  it("enemyEscape: the Host runs for exit hexes and enough escapes is a defeat", () => {
    const runner = doctrine("runner_ah", AH, [[{ kind: "always" }, { kind: "advance", toward: { kind: "exitEdge" } }]]);
    const scen = scenario({
      winCondition: { kind: "destroySquads", squadIds: ["h1"] },
      defeatConditions: [{ kind: "enemyEscape", edgeHexes: [{ q: 6, r: 0 }, { q: 6, r: 1 }], count: 2 }],
      squads: [
        squad("p", FB, { q: 0, r: 4 }),
        squad("h1", AH, { q: 4, r: 0 }, { doctrineId: "runner_ah" }),
        squad("h2", AH, { q: 5, r: 1 }, { doctrineId: "runner_ah" }),
      ],
    });
    const { state, events } = run(scen, {}, library(runner));
    expect(events.filter((event) => event.kind === "exit").map((event) => ("squadId" in event ? event.squadId : ""))).toEqual(["h2", "h1"]);
    expect(state.status).toBe("defeat");
    expect(events.at(-1)).toMatchObject({ kind: "outcome", reason: expect.stringMatching(/broke through/) });
  });

  it("squadsLost: the line breaks when enough player squads are gone", () => {
    const hunter = doctrine("hunter3", AH, [[{ kind: "always" }, { kind: "attack", target: { kind: "nearestEnemy" } }]]);
    const scen = scenario({
      defeatConditions: [{ kind: "squadsLost", count: 1 }],
      squads: [
        squad("h", AH, { q: 1, r: 2 }, { doctrineId: "hunter3", strength: 100 }),
        squad("p", FB, { q: 2, r: 2 }, { cohesion: 1 }),
        squad("p2", FB, { q: 6, r: 4 }),
      ],
    });
    const { state, events } = run(scen, {}, library(hunter));
    expect(state.status).toBe("defeat");
    expect(events.at(-1)).toMatchObject({ kind: "outcome", reason: expect.stringMatching(/line broke/) });
  });

  it("rejects defeat conditions that can never trigger", () => {
    const withDefeat = (defeatConditions: EngineScenario["defeatConditions"]) =>
      scenario({ defeatConditions, squads: [squad("p", FB, { q: 6, r: 4 }), squad("h", AH, { q: 0, r: 0 })] });
    expect(() => createInitialState(withDefeat([{ kind: "enemyEscape", edgeHexes: [], count: 1 }]))).toThrow(/enemyEscape/);
    expect(() => createInitialState(withDefeat([{ kind: "squadsLost", count: 0 }]))).toThrow(/squadsLost/);
  });

  it("any mode: defeat when every player squad has left the field", () => {
    const hunter = doctrine("hunter2", AH, [[{ kind: "always" }, { kind: "attack", target: { kind: "nearestEnemy" } }]]);
    const scen = scenario({
      objectives: [gate],
      winCondition: { kind: "holdObjective", objectiveId: "gate" },
      squads: [squad("h", AH, { q: 1, r: 2 }, { doctrineId: "hunter2", strength: 100 }), squad("p", FB, { q: 2, r: 2 }, { cohesion: 1 })],
    });
    const { state, events } = run(scen, {}, library(hunter));
    expect(state.status).toBe("defeat");
    expect(events.at(-1)).toMatchObject({ kind: "outcome", reason: expect.stringMatching(/No company/) });
  });
});

describe("data isolation", () => {
  /** Every {q, r} object reachable from a value. */
  function coordsIn(value: unknown, found: object[] = []): object[] {
    if (value && typeof value === "object") {
      if ("q" in value && "r" in value) {
        found.push(value);
      }
      for (const child of Object.values(value)) {
        coordsIn(child, found);
      }
    }
    return found;
  }

  it("returned state and events never share coordinate objects with the scenario or each other", () => {
    const scen = firstBreach;
    const pristine = structuredClone(scen);
    const boardCoords = new Set<object>(coordsIn(scen));
    let state = createInitialState(scen, { seed: 3, fortune: "on" });
    const results = [];
    while (state.status === "command") {
      const result = resolvePhase(state, scen.referencePlans!.intended, scen);
      results.push(result);
      state = result.state;
    }
    for (const result of results) {
      const stateCoords = coordsIn(result.state);
      const eventCoords = coordsIn(result.events);
      expect(eventCoords.length).toBeGreaterThan(0);
      expect(stateCoords.some((coord) => boardCoords.has(coord))).toBe(false);
      expect(eventCoords.some((coord) => boardCoords.has(coord))).toBe(false);
      const stateSet = new Set(stateCoords);
      expect(eventCoords.some((coord) => stateSet.has(coord))).toBe(false);
    }
    // Scribbling over everything the engine returned must not touch the scenario.
    for (const coord of coordsIn(results)) {
      Object.assign(coord, { q: 999, r: 999 });
    }
    expect(scen).toEqual(pristine);
  });

  it("move paths are fresh objects, distinct from the squad's new position", () => {
    const doctrines = library(doctrine("walker", FB, [[{ kind: "always" }, { kind: "advance", toward: { kind: "nearestEnemy" } }]]));
    const walker = scenario({ squads: [squad("a", FB, { q: 0, r: 2 }, { doctrineId: "walker" }), squad("e", AH, { q: 5, r: 2 })] });
    const { events, state } = resolvePhase(createInitialState(walker), {}, walker, { doctrines });
    // The last move put the squad where it now stands: equal values, different objects.
    const move = events.filter((event) => event.kind === "move").at(-1);
    const path = move && move.kind === "move" ? move.path : [];
    const position = state.squads[0].hex;
    expect(path.at(-1)).toEqual(position);
    expect(path.every((hex) => hex !== position)).toBe(true);
  });
});
