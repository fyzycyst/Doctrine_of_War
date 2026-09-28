import { describe, expect, it } from "vitest";
import { getHex, hexNeighbors } from "../../game/board";
import {
  createInitialState,
  eventsFor,
  firstBreach,
  resolvePhase,
  visibleState,
  type EngineEvent,
  type EngineState,
  type FactionId,
} from "../../game/engine";
import { boardCenter, hexToWorld } from "../../render/hexWorld";
import { applyStep, buildTimeline, PHASE_BUDGET_MS, routDirection, snapshotBefore, STEP_MS, visibleRuns, type Step } from "./timeline";

const PLAYER: FactionId = "free_banners";
const factionOf = (id: string) => firstBreach.squads.find((squad) => squad.id === id)?.faction;
const ctx = { playerFaction: PLAYER, factionOf };
const base = { phase: 1, visibleTo: [PLAYER] };

const rule = (squadId: string, ruleId: string, beat: number): EngineEvent => ({
  ...base,
  beat,
  kind: "ruleFired",
  squadId,
  doctrineId: "shield_the_line",
  ruleId,
  label: "If enemy adjacent → brace shields",
});

/** Every phase of First Breach on the curated seed, as the player saw it. */
function curatedPhases() {
  let state: EngineState = createInitialState(firstBreach, { fortune: "on", seed: firstBreach.curatedSeed });
  const phases: EngineEvent[][] = [];
  while (state.status === "command") {
    const result = resolvePhase(state, firstBreach.referencePlans!.intended, firstBreach);
    phases.push(eventsFor(result.events, PLAYER));
    state = result.state;
  }
  return phases;
}

describe("buildTimeline", () => {
  it("keeps the engine's order and opens each beat with a marker", () => {
    const events = [rule("cinder_vanguard", "it_press", 1), rule("greyford_shields", "stl_brace", 1), rule("greyford_shields", "stl_brace", 2)];
    const { steps } = buildTimeline(events, "readable", ctx);
    expect(steps.map((step) => [step.kind, step.beat])).toEqual([
      ["beat", 1],
      ["rule", 1],
      ["rule", 1],
      ["beat", 2],
      ["rule", 2],
    ]);
    // Host first within the beat, exactly as the engine emitted it.
    expect(steps.filter((step) => step.kind === "rule").map((step) => (step.event as { squadId: string }).squadId)).toEqual([
      "cinder_vanguard",
      "greyford_shields",
      "greyford_shields",
    ]);
  });

  it("makes a rule the squad already showed a short repeat", () => {
    const { steps } = buildTimeline([rule("greyford_shields", "stl_brace", 1), rule("greyford_shields", "stl_brace", 2)], "readable", ctx);
    const rules = steps.filter((step) => step.kind === "rule");
    expect(rules.map((step) => step.repeat)).toEqual([false, true]);
    expect(rules[0].duration).toBe(STEP_MS.ruleMine);
    expect(rules[1].duration).toBe(STEP_MS.ruleRepeat);
    expect(rules[0].linger).toBeGreaterThan(rules[1].linger);
  });

  it("gives each Host squad one callout per phase; later Host firings are caption-only", () => {
    const { steps } = buildTimeline(
      [rule("cinder_vanguard", "it_press", 1), rule("cinder_vanguard", "it_march", 2), rule("greyford_shields", "stl_brace", 2), rule("greyford_shields", "stl_hold", 3)],
      "readable",
      ctx,
    );
    const rules = steps.filter((step) => step.kind === "rule");
    expect(rules.map((step) => step.quiet)).toEqual([false, true, false, false]);
    expect(rules[1].linger).toBe(0);
    // The player's change of rule is a full callout, not a repeat.
    expect(rules[3].repeat).toBe(false);
  });

  it("lays steps end to end and halves every step at Fast", () => {
    const events = curatedPhases()[0];
    const readable = buildTimeline(events, "readable", ctx);
    const fast = buildTimeline(events, "fast", ctx);
    readable.steps.forEach((step, index) => {
      expect(step.at).toBe(index === 0 ? 0 : readable.steps[index - 1].at + readable.steps[index - 1].duration);
      expect(Math.abs(fast.steps[index].duration - step.duration / 2)).toBeLessThanOrEqual(1);
    });
    expect(fast.totalMs).toBeLessThanOrEqual(readable.totalMs / 2 + fast.steps.length);
  });

  it("fits every curated First Breach phase in the budget: ≤ 24 s Readable, ≤ 12 s Fast", () => {
    for (const events of curatedPhases()) {
      expect(buildTimeline(events, "readable", ctx).totalMs).toBeLessThanOrEqual(PHASE_BUDGET_MS);
      expect(buildTimeline(events, "fast", ctx).totalMs).toBeLessThanOrEqual(PHASE_BUDGET_MS / 2 + 50);
    }
  });

  it("skips blocked events and empty (fully unseen) moves", () => {
    const { steps } = buildTimeline(
      [
        { ...base, beat: 1, kind: "blocked", squadId: "greyford_shields", reason: "no target" },
        { ...base, beat: 1, kind: "move", squadId: "ember_runners", path: [], from: null, to: null, reason: "advance" },
      ],
      "readable",
      ctx,
    );
    expect(steps).toEqual([]);
  });

  it("clips a move that emerges from the fog to the hexes the player saw", () => {
    const move: EngineEvent = {
      ...base,
      beat: 1,
      kind: "move",
      squadId: "ember_runners",
      path: [
        { q: 1, r: 1 },
        { q: 2, r: 1 },
      ],
      from: null,
      to: { q: 2, r: 1 },
      reason: "advance",
    };
    const [marker, step] = buildTimeline([move], "readable", ctx).steps;
    expect(marker.kind).toBe("beat");
    expect(step).toMatchObject({ kind: "move", emerges: true, vanishes: false, path: move.path });
    expect(step.duration).toBe(STEP_MS.movePerHex + STEP_MS.emerge);
  });
});

describe("applyStep", () => {
  const start = visibleState(createInitialState(firstBreach, { fortune: "off" }), PLAYER);
  const known = (id: string) => start.squads.find((squad) => squad.id === id);
  const stepFor = (event: EngineEvent, extra: Partial<Step> = {}): Step => ({
    kind: "move",
    beat: event.beat,
    event,
    index: 0,
    at: 0,
    duration: 0,
    linger: 0,
    repeat: false,
    quiet: false,
    path: [],
    runs: [],
    emerges: false,
    vanishes: false,
    ...extra,
  });

  it("brings an emerging squad onto the board at its first seen hex and marches it", () => {
    const hidden = { ...start, squads: start.squads.filter((squad) => squad.id !== "ember_runners") };
    const path = [
      { q: 1, r: 1 },
      { q: 1, r: 2 },
    ];
    const event: EngineEvent = { ...base, beat: 1, kind: "move", squadId: "ember_runners", path, from: null, to: path[1], reason: "advance" };
    const after = applyStep(hidden, stepFor(event, { path, emerges: true }), known);
    expect(after.squads.find((squad) => squad.id === "ember_runners")).toMatchObject({ hex: path[1], lastKnown: false });
  });

  it("leaves a vanishing squad as a last-known ghost with its doctrine hidden", () => {
    const path = [{ q: 2, r: 0 }];
    const event: EngineEvent = { ...base, beat: 1, kind: "move", squadId: "ember_runners", path, from: path[0], to: null, reason: "advance" };
    const after = applyStep(start, stepFor(event, { path, vanishes: true }), known);
    expect(after.squads.find((squad) => squad.id === "ember_runners")).toMatchObject({ hex: path[0], lastKnown: true, doctrineId: null });
  });

  it("applies a clash's losses and removes a routed squad from the board", () => {
    const clash: EngineEvent = {
      ...base,
      beat: 1,
      kind: "engagement",
      attackerId: "cinder_vanguard",
      defenderId: "greyford_shields",
      attackerHex: { q: 1, r: 2 },
      defenderHex: { q: 3, r: 2 },
      charge: false,
      reckless: false,
      strengthChanges: { greyford_shields: -4, cinder_vanguard: -2 },
      cohesionChanges: { greyford_shields: -12 },
    };
    const hit = applyStep(start, stepFor(clash, { kind: "clash" }), known);
    expect(hit.squads.find((squad) => squad.id === "greyford_shields")).toMatchObject({ strength: 82, cohesion: 64 });
    expect(hit.squads.find((squad) => squad.id === "cinder_vanguard")).toMatchObject({ strength: 98 });

    const rout: EngineEvent = { ...base, beat: 1, kind: "rout", squadId: "greyford_shields", hex: { q: 3, r: 2 }, cause: "cohesion" };
    const gone = applyStep(hit, stepFor(rout, { kind: "rout" }), known);
    expect(gone.squads.find((squad) => squad.id === "greyford_shields")).toMatchObject({ status: "routed", hex: null });
  });

  it("advances the gate and the weather as they play", () => {
    const hitGate: EngineEvent = { ...base, beat: 2, kind: "objectiveDamage", objectiveId: "greyford_gate", attackerId: null, hex: { q: 4, r: 2 }, oldIntegrity: 100, newIntegrity: 88 };
    expect(applyStep(start, stepFor(hitGate, { kind: "siege" }), known).objectives[0].integrity).toBe(88);
    const turn: EngineEvent = { ...base, beat: 0, kind: "weatherShift", from: "clear", to: "rain" };
    expect(applyStep(start, stepFor(turn, { kind: "weather" }), known).weather).toBe("rain");
  });
});

describe("routDirection", () => {
  it("never sends a squad into a wall or deep river, and prefers its home side", () => {
    const center = boardCenter(firstBreach.board);
    for (const hex of firstBreach.board.hexes) {
      for (const faction of ["free_banners", "ashen_host"] as const) {
        const direction = routDirection(firstBreach.board, hex.coord, faction);
        if (!direction) continue;
        const [dx, dz] = direction;
        const [ox, oz] = hexToWorld(hex.coord, center);
        const target = hexNeighbors(hex.coord).find((neighbour) => {
          const [nx, nz] = hexToWorld(neighbour, center);
          const length = Math.hypot(nx - ox, nz - oz);
          return Math.abs((nx - ox) / length - dx) < 1e-9 && Math.abs((nz - oz) / length - dz) < 1e-9;
        });
        if (target) {
          expect(["wall", "river"]).not.toContain(getHex(firstBreach.board, target)?.terrain);
        }
      }
    }
    // Greyford Shields at the Siege Approach, beside the gate: they must not run east into the wall.
    const [dx] = routDirection(firstBreach.board, { q: 3, r: 2 }, "free_banners")!;
    expect(dx).toBeGreaterThan(0);
    const [hx] = routDirection(firstBreach.board, { q: 1, r: 2 }, "ashen_host")!;
    expect(hx).toBeLessThan(0);
  });

  it("has no line of flight when every neighbour is wall or deep river", () => {
    const centre = { q: 1, r: 1 };
    const board = {
      width: 3,
      height: 3,
      hexes: [
        { coord: centre, terrain: "field" as const },
        ...hexNeighbors(centre).map((coord, i) => ({ coord, terrain: i % 2 ? ("wall" as const) : ("river" as const) })),
      ],
    };
    expect(routDirection(board, centre, "free_banners")).toBeNull();
  });
});

describe("emerging squads", () => {
  it("appear as they were when first seen, and take later losses only when those land", () => {
    const final = visibleState(createInitialState(firstBreach, { fortune: "off" }), PLAYER);
    const runnersEnd = { ...final.squads.find((squad) => squad.id === "ember_runners")!, strength: 60, cohesion: 40 };
    const end = { ...final, squads: final.squads.map((squad) => (squad.id === "ember_runners" ? runnersEnd : squad)) };
    const start = { ...final, squads: final.squads.filter((squad) => squad.id !== "ember_runners") };
    const path = [
      { q: 1, r: 1 },
      { q: 2, r: 1 },
    ];
    const events: EngineEvent[] = [
      { ...base, beat: 1, kind: "move", squadId: "ember_runners", path, from: null, to: path[1], reason: "advance" },
      rule("greyford_shields", "stl_brace", 1),
      {
        ...base,
        beat: 2,
        kind: "engagement",
        attackerId: "ember_runners",
        defenderId: "dawnwatch_archers",
        attackerHex: path[1],
        defenderHex: { q: 2, r: 2 },
        charge: false,
        reckless: false,
        strengthChanges: { ember_runners: -10, dawnwatch_archers: -3 },
        cohesionChanges: { ember_runners: -8 },
      },
      { ...base, beat: 3, kind: "rally", sourceId: "ashbound_thralls", targetId: "ember_runners", restored: 6 },
    ];
    const known = (id: string, step: Step) => snapshotBefore(end.squads.find((squad) => squad.id === id), events, step.index);
    const { steps } = buildTimeline(events, "readable", ctx);

    const runners = (view: typeof start) => view.squads.find((squad) => squad.id === "ember_runners");
    const shown: Array<[string, number | undefined, number | undefined]> = [];
    let view = start;
    for (const step of steps) {
      view = applyStep(view, step, known);
      shown.push([step.kind, runners(view)?.strength, runners(view)?.cohesion]);
    }
    // On emergence: the end state with the later clash and rally undone.
    expect(shown.find(([kind]) => kind === "move")).toEqual(["move", 70, 42]);
    expect(shown.find(([kind]) => kind === "clash")).toEqual(["clash", 60, 34]);
    expect(shown.find(([kind]) => kind === "rally")).toEqual(["rally", 60, 40]);
    expect(runners(view)).toMatchObject({ strength: runnersEnd.strength, cohesion: runnersEnd.cohesion });
  });
});

describe("moves through unseen hexes", () => {
  it("splits a projected path at every unseen gap", () => {
    const path = [
      { q: 0, r: 2 },
      { q: 1, r: 2 },
      // (1,3) was out of sight and cut from the projection.
      { q: 2, r: 3 },
      { q: 3, r: 3 },
    ];
    expect(visibleRuns(path)).toEqual([path.slice(0, 2), path.slice(2)]);
    expect(visibleRuns(path.slice(0, 2))).toEqual([path.slice(0, 2)]);
    const [, step] = buildTimeline(
      [{ ...base, beat: 1, kind: "move", squadId: "ford_reavers", path, from: path[0], to: path[3], reason: "advance" }],
      "readable",
      ctx,
    ).steps;
    expect(step.runs).toHaveLength(2);
    expect(step.duration).toBe(STEP_MS.movePerHex * 2 + STEP_MS.fogGap);
  });
});
