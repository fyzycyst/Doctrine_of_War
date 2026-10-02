// P4, the offensive prototype: the aheadOfLine condition, the breakObjective win type,
// Bring the Water, and the Wagon Park fixture (Banner initiative under fog).
import { describe, expect, it } from "vitest";
import { doctrineLibrary } from "./doctrines";
import { wagonPark } from "./fixtures/wagonPark";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { evaluateCondition } from "./rules";
import { actionContext, advanceRate, library, scenario, squad } from "./testKit";
import type { EngineEvent, EngineScenario, ObjectiveSetup, SquadSetup } from "./types";

const FB = "free_banners" as const;
const AH = "ashen_host" as const;
const BTW = "bring_the_water";

const run = (scen: EngineScenario) => resolvePhase(createInitialState(scen), {}, scen, { doctrines: library() });

const park: ObjectiveSetup = { id: "park", name: "The Park", description: "", hex: { q: 6, r: 2 }, integrity: 30, defender: AH };

describe("aheadOfLine (keep step)", () => {
  const ahead = (squads: SquadSetup[], by = 2, objectives = [park]) => {
    const kit = actionContext(scenario({ objectives, squads }));
    return evaluateCondition(kit.ctx, kit.get(squads[0].id), { kind: "aheadOfLine", by });
  };
  const me = (hex: { q: number; r: number }) => squad("me", FB, hex, { doctrineId: BTW });

  it("matches only when every other company of the line is at least `by` hexes farther from the objective", () => {
    // me is 2 from the park; the line is 4 and 5 away.
    expect(ahead([me({ q: 4, r: 2 }), squad("a", FB, { q: 2, r: 2 }, { doctrineId: BTW }), squad("b", FB, { q: 1, r: 2 }, { doctrineId: BTW })])).toBe(true);
    // One company keeps step with it (3 away): it marches on, whoever straggles.
    expect(ahead([me({ q: 4, r: 2 }), squad("a", FB, { q: 3, r: 2 }, { doctrineId: BTW }), squad("b", FB, { q: 0, r: 2 }, { doctrineId: BTW })])).toBe(false);
    expect(ahead([me({ q: 4, r: 2 }), squad("a", FB, { q: 3, r: 2 }, { doctrineId: BTW })], 1)).toBe(true);
  });

  it("the line is the squad's own doctrine: other doctrines and noncombatants do not hold it back", () => {
    expect(ahead([me({ q: 4, r: 2 }), squad("std", FB, { q: 0, r: 2 }, { doctrineId: "rescue_standard" })])).toBe(false);
    expect(ahead([me({ q: 4, r: 2 }), squad("col", FB, { q: 0, r: 2 }, { doctrineId: BTW, noncombatant: true })])).toBe(false);
  });

  it("is false with no standing enemy objective, and never reads an enemy", () => {
    const line = [me({ q: 4, r: 2 }), squad("a", FB, { q: 1, r: 2 }, { doctrineId: BTW })];
    expect(ahead(line, 2, [])).toBe(false);
    expect(ahead(line, 2, [{ ...park, defender: FB }])).toBe(false);
    expect(ahead(line, 2, [{ ...park, integrity: 0 }])).toBe(false);
    // Enemies anywhere, seen or not, change nothing.
    expect(ahead([...line, squad("e", AH, { q: 5, r: 2 }), squad("f", AH, { q: 3, r: 2 })])).toBe(true);
  });

  it("holds a fast company back until the line comes up, then it marches and batters", () => {
    const scen = scenario({
      initiativeSide: FB,
      objectives: [park],
      winCondition: { kind: "breakObjective", objectiveId: "park" },
      maxPhases: 2,
      squads: [
        squad("a", FB, { q: 0, r: 2 }, { doctrineId: BTW }),
        squad("b", FB, { q: 0, r: 3 }, { doctrineId: BTW }),
        squad("rider", FB, { q: 3, r: 2 }, { doctrineId: BTW, role: "cavalry" }),
        squad("h", AH, { q: 0, r: 0 }),
      ],
    });
    const { events } = run(scen);
    const rider = events.filter((event) => event.kind === "ruleFired" && event.squadId === "rider").map((event) => (event.kind === "ruleFired" ? event.ruleId : ""));
    expect(rider).toEqual(["btw_step", "btw_march", "btw_break"]);
  });
});

describe("breakObjective", () => {
  const breaker = (overrides: Partial<EngineScenario> = {}) =>
    scenario({
      initiativeSide: FB,
      objectives: [park],
      winCondition: { kind: "breakObjective", objectiveId: "park" },
      squads: [
        squad("p", FB, { q: 5, r: 2 }, { doctrineId: BTW, strength: 100 }),
        squad("p2", FB, { q: 5, r: 3 }, { doctrineId: BTW, strength: 100 }),
        squad("h", AH, { q: 0, r: 0 }),
      ],
      ...overrides,
    });

  it("is a victory the moment the objective is battered to 0, mid-beat", () => {
    // 12 damage a blow at full strength: 30 integrity falls on the third blow (beat 2, p).
    const { state, events } = run(breaker());
    expect(state.status).toBe("victory");
    expect(state.objectives[0].integrity).toBe(0);
    expect(events.at(-1)).toMatchObject({ kind: "outcome", status: "victory", beat: 2, reason: "The Park is broken." });
    expect(events.filter((event) => event.kind === "objectiveDamage")).toHaveLength(3);
  });

  it("running out of time is a defeat (or an earned stalemate), with the objective named", () => {
    const far = breaker({ squads: [squad("p", FB, { q: 0, r: 4 }, { doctrineId: BTW }), squad("h", AH, { q: 0, r: 0 })] });
    const lost = run(far);
    expect(lost.state.status).toBe("defeat");
    expect(lost.events.at(-1)).toMatchObject({ kind: "outcome", reason: "Time ran out with the Park still standing." });
    const spent = run({ ...far, timeoutOutcome: "stalemate" });
    expect(spent.events.at(-1)).toMatchObject({ kind: "outcome", status: "stalemate", reason: "The attack is spent, and the Park still stands." });
  });

  it("defeat conditions still apply while the objective stands", () => {
    const scen = breaker({
      defeatConditions: [{ kind: "squadsLost", count: 1 }],
      squads: [squad("p", FB, { q: 0, r: 4 }, { doctrineId: BTW, cohesion: 1 }), squad("p2", FB, { q: 0, r: 3 }), squad("h", AH, { q: 1, r: 3 }, { doctrineId: "no_step_back", strength: 100 })],
    });
    const { state } = run(scen);
    expect(state.status).toBe("defeat");
    expect(state.objectives[0].integrity).toBe(30);
  });

  it("rejects an objective that is missing, the player's own, or already broken", () => {
    expect(() => createInitialState(breaker({ winCondition: { kind: "breakObjective", objectiveId: "ghost" } }))).toThrow(/breakObjective needs/);
    expect(() => createInitialState(breaker({ objectives: [{ ...park, defender: FB }] }))).toThrow(/breakObjective needs/);
    expect(() => createInitialState(breaker({ objectives: [{ ...park, integrity: 0 }] }))).toThrow(/breakObjective needs/);
    expect(() => createInitialState(breaker())).not.toThrow();
  });
});

describe("Bring the Water", () => {
  it("is a Banner covenant that ends in a catch-all march on the objective", () => {
    const doctrine = doctrineLibrary[BTW];
    expect(doctrine.faction).toBe(FB);
    expect(doctrine.rules.map((rule) => rule.label)).toEqual([
      "If cohesion < 30 → fall back 1 hex",
      "If at the objective → batter it",
      "If an enemy bars the way → strike it",
      "If 2 hexes ahead of the line → wait for it",
      "Otherwise → march on the objective",
    ]);
    expect(doctrine.rules.at(-1)?.then).toEqual({ kind: "attack", target: { kind: "objective", side: "enemy" } });
  });
});

describe("The Wagon Park (prototype, Banner initiative under fog)", () => {
  const intended = wagonPark.referencePlans!.intended;

  it("the assault always has a goal under fog: never blocked for want of a target", () => {
    const blocked: string[] = [];
    for (let seed = 1; seed <= 20; seed += 1) {
      let state = createInitialState(wagonPark, { seed, fortune: "on" });
      while (state.status === "command") {
        const result = resolvePhase(state, intended, wagonPark);
        for (const event of result.events as EngineEvent[]) {
          if (event.kind === "blocked" && intended[event.squadId] === BTW && event.reason === "no target") blocked.push(`#${seed} ${event.squadId}`);
        }
        state = result.state;
      }
    }
    expect(blocked).toEqual([]);
  });

  it("wins with fortune off, and every family in the intended plan earns its place (ablation >= 15 points)", () => {
    let state = createInitialState(wagonPark);
    while (state.status === "command") state = resolvePhase(state, intended, wagonPark).state;
    expect(state.status).toBe("victory");

    const base = advanceRate(wagonPark, intended);
    expect(base).toBeGreaterThanOrEqual(0.75);
    // A storm without a standard breaks on the Kept Coal.
    expect(base - advanceRate(wagonPark, { ...intended, lanternbearers: BTW })).toBeGreaterThanOrEqual(0.15);
    // Without the march, nothing reaches the park.
    const noMarch = Object.fromEntries(Object.entries(intended).map(([id, doctrineId]) => [id, doctrineId === BTW ? "clean_counterstroke" : doctrineId]));
    expect(base - advanceRate(wagonPark, noMarch)).toBeGreaterThanOrEqual(0.15);
  }, 60_000);
});
