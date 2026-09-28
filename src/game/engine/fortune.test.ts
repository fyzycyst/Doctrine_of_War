import { describe, expect, it } from "vitest";
import { effectivePassives, engagementLosses, executeAction } from "./actions";
import { applyDread } from "./fog";
import {
  firstContact,
  phaseStartWeather,
  resolveBand,
  stressCheck,
  SURGE_CHANCE,
  SURGE_COHESION,
  WAVER_CHANCE,
} from "./fortune";
import { planAdvance } from "./movement";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { createRng, type Rng } from "./rng";
import { firstBreach } from "./scenarios/firstBreach";
import { actionContext, doctrine, kinds, library, openBoard, scenario, squad } from "./testKit";
import type { DoctrineRule, EngineEvent, EngineState, Orders } from "./types";

const FB = "free_banners" as const;
const AH = "ashen_host" as const;
const on = { fortune: "on" } as const;

/** An rng that always returns `value`, counting how often it was asked. */
function fixedRng(value: number) {
  const rng = { calls: 0, state: 0, next: () => ((rng.calls += 1), value) };
  return rng as Rng & { calls: number };
}

const fallBackRule: DoctrineRule = { id: "fb", label: "fall back", when: { kind: "always" }, then: { kind: "fallBack", hexes: 1 } };
const holdRule: DoctrineRule = { id: "h", label: "hold", when: { kind: "always" }, then: { kind: "hold" } };

function engaged(resolve = 0) {
  return actionContext(
    scenario({ squads: [squad("a", FB, { q: 2, r: 2 }, { resolve }), squad("e", AH, { q: 1, r: 2 })] }),
    library(),
    on,
  );
}

describe("courage & cowardice (stressCheck)", () => {
  it("is neutral and never rolls with fortune off", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 2, r: 2 }), squad("e", AH, { q: 1, r: 2 })] }));
    const rng = fixedRng(0);
    kit.ctx.rng = rng;
    expect(stressCheck(kit.ctx, kit.get("a"), holdRule)).toBe(holdRule);
    expect(rng.calls).toBe(0);
    expect(kit.events).toEqual([]);
  });

  it("does not roll for a squad that is not under stress", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 0, r: 0 }), squad("e", AH, { q: 6, r: 4 })] }), library(), on);
    const rng = fixedRng(0);
    kit.ctx.rng = rng;
    expect(stressCheck(kit.ctx, kit.get("a"), holdRule)).toBe(holdRule);
    expect(rng.calls).toBe(0);
  });

  it("a low roll makes a stressed squad waver: its rule does not fire", () => {
    const kit = engaged();
    kit.ctx.rng = fixedRng(0);
    expect(stressCheck(kit.ctx, kit.get("a"), holdRule)).toBeNull();
    expect(kit.events).toEqual([{ kind: "fortune", squadId: "a", outcome: "waver", ruleId: "h" }]);
  });

  it("a high roll surges: cohesion back, harder blows, and a fall-back becomes a heroic stand", () => {
    const kit = engaged();
    kit.ctx.rng = fixedRng(0.999);
    const before = kit.get("a").cohesion;
    const rule = stressCheck(kit.ctx, kit.get("a"), fallBackRule);
    expect(rule?.then).toEqual({ kind: "hold" });
    expect(rule?.label).toMatch(/Heroic stand/);
    expect(kit.get("a").surging).toBe(true);
    expect(kit.get("a").cohesion).toBe(before + SURGE_COHESION);
    expect(kit.events).toEqual([{ kind: "fortune", squadId: "a", outcome: "surge", ruleId: "fb" }]);

    const plain = engagementLosses(kit.ctx, kit.get("e"), kit.get("a"), false);
    kit.get("a").surging = false;
    const unsurged = engagementLosses(kit.ctx, kit.get("e"), kit.get("a"), false);
    expect(plain.defenderCohesion).toBeLessThan(unsurged.defenderCohesion);
  });

  it("is Resolve-weighted: veterans rarely waver, broken squads often do", () => {
    expect(WAVER_CHANCE["3"]).toBeLessThan(WAVER_CHANCE["0"]);
    expect(WAVER_CHANCE["0"]).toBeLessThan(WAVER_CHANCE["-3"]);
    expect(SURGE_CHANCE["3"]).toBeGreaterThan(SURGE_CHANCE["-3"]);
    expect(resolveBand(7)).toBe("3");
    expect(resolveBand(-9)).toBe("-3");

    const waverRate = (resolve: number) => {
      const kit = engaged(resolve);
      kit.ctx.rng = createRng(2024);
      let wavers = 0;
      for (let i = 0; i < 2000; i += 1) {
        wavers += stressCheck(kit.ctx, kit.get("a"), holdRule) === null ? 1 : 0;
      }
      return wavers / 2000;
    };
    const veteran = waverRate(3);
    const green = waverRate(0);
    const broken = waverRate(-3);
    expect(veteran).toBeLessThan(green);
    expect(green).toBeLessThan(broken);
    expect(broken).toBeCloseTo(WAVER_CHANCE["-3"], 1);
  });
});

describe("weather", () => {
  const forecastScenario = (shiftChance: number) =>
    scenario({
      squads: [squad("a", FB, { q: 0, r: 0 }), squad("e", AH, { q: 6, r: 4 })],
      forecast: { start: "clear", shiftChance, shifts: ["clear", "rain"] },
      maxPhases: 3,
    });

  it("starts at the forecast and never shifts in phase 1", () => {
    const kit = actionContext(forecastScenario(1), library(), on);
    kit.ctx.phase = 1;
    phaseStartWeather(kit.ctx);
    expect(kit.state.weather).toBe("clear");
    expect(kit.events).toEqual([]);
  });

  it("shifts (seeded) at a later phase start", () => {
    const kit = actionContext(forecastScenario(1), library(), on);
    kit.ctx.phase = 2;
    phaseStartWeather(kit.ctx);
    expect(kit.state.weather).toBe("rain");
    expect(kit.events).toEqual([{ kind: "weatherShift", from: "clear", to: "rain" }]);
  });

  it("stays at the forecast with fortune off, whatever the chance", () => {
    const kit = actionContext(forecastScenario(1));
    kit.ctx.phase = 2;
    phaseStartWeather(kit.ctx);
    expect(kit.state.weather).toBe("clear");
  });

  it("rain: entering a ford ends the move, and counter passives are halved", () => {
    const board = openBoard(7, 5, { "1,2": "ford" });
    const kit = actionContext(
      scenario({ board, squads: [squad("cav", FB, { q: 0, r: 2 }, { role: "cavalry" }), squad("e", AH, { q: 6, r: 2 })] }),
      library(),
      on,
    );
    const goals = [{ q: 5, r: 2 }];
    expect(planAdvance(kit.state, board, kit.get("cav"), goals, 2)).toHaveLength(3);
    kit.state.weather = "rain";
    expect(planAdvance(kit.state, board, kit.get("cav"), goals, 2)).toEqual([{ q: 0, r: 2 }, { q: 1, r: 2 }]);

    kit.get("cav").doctrineId = "clean_counterstroke";
    expect(effectivePassives(kit.ctx, kit.get("cav")).counter).toBe(2);
    kit.state.weather = "clear";
    expect(effectivePassives(kit.ctx, kit.get("cav")).counter).toBe(4);
  });

  it("ash-wind steadies the Host and deepens Host dread", () => {
    const kit = actionContext(
      scenario({
        squads: [squad("v", FB, { q: 2, r: 2 }), squad("champ", AH, { q: 1, r: 2 }, { resolve: 2, renown: { title: "The Ashen Crown" } })],
      }),
      library(),
      on,
    );
    kit.state.weather = "ashWind";
    expect(effectivePassives(kit.ctx, kit.get("champ")).cohesion).toBe(1);
    expect(effectivePassives(kit.ctx, kit.get("v")).cohesion).toBe(0);
    applyDread(kit.ctx, kit.get("v"), kit.get("champ"));
    expect(kit.events).toEqual([{ kind: "dread", squadId: "v", sourceId: "champ", title: "The Ashen Crown", shock: 15 }]);
  });
});

describe("renown & dread", () => {
  const renowned = (faction: typeof FB | typeof AH, resolve: number) =>
    squad("champ", faction, { q: 1, r: 2 }, { resolve, renown: { title: "The Gatebreakers" } });

  it("shocks an enemy once, scaled by the Resolve gap", () => {
    const kit = actionContext(scenario({ squads: [squad("v", FB, { q: 2, r: 2 }, { resolve: -1 }), renowned(AH, 3)] }), library(), on);
    applyDread(kit.ctx, kit.get("v"), kit.get("champ"));
    applyDread(kit.ctx, kit.get("v"), kit.get("champ"));
    expect(kit.events).toEqual([{ kind: "dread", squadId: "v", sourceId: "champ", title: "The Gatebreakers", shock: 20 }]);
    expect(kit.get("v").cohesion).toBe(60);
  });

  it("is floored at 0: veterans shrug off a lesser champion", () => {
    const kit = actionContext(scenario({ squads: [squad("v", FB, { q: 2, r: 2 }, { resolve: 3 }), renowned(AH, 1)] }), library(), on);
    applyDread(kit.ctx, kit.get("v"), kit.get("champ"));
    expect(kit.events).toEqual([]);
    expect(kit.state.dreaded).toEqual(["v>champ"]);
  });

  it("works for both factions and on first contact", () => {
    const kit = actionContext(scenario({ squads: [renowned(FB, 3), squad("h", AH, { q: 2, r: 2 })] }), library(), on);
    firstContact(kit.ctx, kit.get("champ"), kit.get("h"));
    expect(kit.events).toEqual([{ kind: "dread", squadId: "h", sourceId: "champ", title: "The Gatebreakers", shock: 15 }]);
  });

  it("fires on sighting during a phase, and never with fortune off", () => {
    const scen = scenario({ squads: [squad("v", FB, { q: 3, r: 2 }), renowned(AH, 3)], maxPhases: 2 });
    const dreadOn = resolvePhase(createInitialState(scen, on), {}, scen, { doctrines: library() }).events.filter(
      (event) => event.kind === "dread",
    );
    expect(dreadOn).toEqual([
      {
        kind: "dread",
        phase: 1,
        beat: 0,
        visibleTo: ["free_banners", "ashen_host"],
        squadId: "v",
        sourceId: "champ",
        title: "The Gatebreakers",
        shock: 15,
      },
    ]);
    const off = resolvePhase(createInitialState(scen), {}, scen, { doctrines: library() });
    expect(kinds(off.events)).not.toContain("dread");
  });

  it("can rout a squad outright", () => {
    const kit = actionContext(
      scenario({ squads: [squad("v", FB, { q: 2, r: 2 }, { cohesion: 10, resolve: -3 }), renowned(AH, 3)] }),
      library(),
      on,
    );
    applyDread(kit.ctx, kit.get("v"), kit.get("champ"));
    expect(kinds(kit.events)).toEqual(["dread", "rout"]);
    expect(kit.get("v").status).toBe("routed");
  });
});

describe("counterstroke discipline", () => {
  it("a charge into a supported enemy is reckless: no charge bonus, and its neighbours join the riposte", () => {
    const setup = (supported: boolean) => {
      const squads = [squad("c", FB, { q: 1, r: 2 }, { doctrineId: "clean_counterstroke" }), squad("t", AH, { q: 2, r: 2 })];
      if (supported) {
        squads.push(squad("friend", AH, { q: 3, r: 2 }));
      }
      const kit = actionContext(scenario({ squads }), library());
      return engagementLosses(kit.ctx, kit.get("c"), kit.get("t"), true);
    };
    const clean = setup(false);
    const reckless = setup(true);
    expect(clean.reckless).toBe(false);
    expect(reckless.reckless).toBe(true);
    expect(reckless.defenderStrength).toBeLessThan(clean.defenderStrength);
    expect(reckless.attackerStrength).toBeGreaterThan(clean.attackerStrength);
  });

  it("the engagement event records the reckless charge", () => {
    const kit = actionContext(
      scenario({ squads: [squad("c", FB, { q: 1, r: 2 }), squad("t", AH, { q: 2, r: 2 }), squad("f", AH, { q: 3, r: 2 })] }),
    );
    executeAction(kit.ctx, kit.get("c"), { kind: "counterCharge", target: { kind: "nearestEnemy" } });
    expect(kit.events[0]).toMatchObject({ kind: "engagement", charge: true, reckless: true });
  });
});

describe("seeded reproducibility", () => {
  function battle(orders: Orders, seed: number, fortune: "on" | "off") {
    let state: EngineState = createInitialState(firstBreach, { seed, fortune });
    const events: EngineEvent[] = [];
    while (state.status === "command") {
      const result = resolvePhase(state, orders, firstBreach);
      events.push(...result.events);
      state = result.state;
    }
    return { state, events };
  }
  const plan = firstBreach.referencePlans!.intended;

  it("the same seed reproduces the same events, and different seeds diverge", () => {
    expect(battle(plan, 42, "on")).toEqual(battle(plan, 42, "on"));
    const variety = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(battle(plan, seed, "on").events)));
    expect(variety.size).toBeGreaterThan(1);
  });

  it("fortune on produces fortune and sighting events; the rng advances and the seed is reported", () => {
    const scen = firstBreach;
    const first = resolvePhase(createInitialState(scen, { seed: 9, fortune: "on" }), plan, scen);
    expect(first.state.rngState).not.toBe(9);
    expect(first.report.seed).toBe(9);
    const all = [1, 2, 3, 4, 5, 6].flatMap((seed) => battle(plan, seed, "on").events);
    expect(kinds(all)).toContain("fortune");
    expect(kinds(all)).toContain("sighted");
  });

  it("fortune off produces zero fortune, dread, weatherShift or sighted events", () => {
    for (const seed of [1, 2, 3]) {
      const { events, state } = battle(plan, seed, "off");
      expect(kinds(events).filter((kind) => ["fortune", "dread", "weatherShift", "sighted"].includes(kind))).toEqual([]);
      expect(state.rngState).toBe(seed);
      expect(state.weather).toBe(firstBreach.forecast?.start);
    }
  });

  it("weather shifts happen across seeds when fortune is on", () => {
    const shifts = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => battle(plan, seed, "on").events).filter(
      (event) => event.kind === "weatherShift",
    );
    expect(shifts.length).toBeGreaterThan(0);
  });

  it("uses the doctrine library passed in", () => {
    const stand = doctrine("stand", FB, [[{ kind: "always" }, { kind: "hold" }]]);
    const scen = scenario({ squads: [squad("a", FB, { q: 0, r: 0 }, { doctrineId: "stand" }), squad("e", AH, { q: 6, r: 4 })] });
    const { events } = resolvePhase(createInitialState(scen), {}, scen, { doctrines: library(stand) });
    expect(events.find((event) => event.kind === "ruleFired")).toMatchObject({ doctrineId: "test_hold_ah" });
    expect(events.filter((event) => event.kind === "ruleFired" && event.doctrineId === "stand")).toHaveLength(3);
  });
});
