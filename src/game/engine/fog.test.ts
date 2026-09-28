import { describe, expect, it } from "vitest";
import { executeAction } from "./actions";
import { canSee, hexLine, refreshIntel, sightRange, visibleState } from "./fog";
import { perceive } from "./perception";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { evaluateCondition } from "./rules";
import { actionContext, doctrine, library, openBoard, scenario, squad } from "./testKit";
import type { EventBody } from "./context";

const FB = "free_banners" as const;
const AH = "ashen_host" as const;
const on = { fortune: "on" } as const;

describe("line of sight", () => {
  it("draws straight hex lines", () => {
    expect(hexLine({ q: 0, r: 2 }, { q: 3, r: 2 })).toEqual([
      { q: 0, r: 2 },
      { q: 1, r: 2 },
      { q: 2, r: 2 },
      { q: 3, r: 2 },
    ]);
  });

  it("sees 2 hexes; +1 from a ridge; -1 in mist", () => {
    const board = openBoard(7, 5, { "0,2": "ridge" });
    const kit = actionContext(
      scenario({ board, squads: [squad("low", FB, { q: 0, r: 0 }), squad("high", FB, { q: 0, r: 2 }), squad("e", AH, { q: 6, r: 4 })] }),
      library(),
      on,
    );
    expect(sightRange(kit.ctx, kit.get("low"))).toBe(2);
    expect(sightRange(kit.ctx, kit.get("high"))).toBe(3);
    kit.state.weather = "mist";
    expect(sightRange(kit.ctx, kit.get("low"))).toBe(1);
  });

  it("is blocked by ruins between the squads, but never between neighbours", () => {
    const board = openBoard(7, 5, { "1,2": "ruin" });
    const kit = actionContext(
      scenario({ board, squads: [squad("o", FB, { q: 0, r: 2 }), squad("far", AH, { q: 2, r: 2 }), squad("near", AH, { q: 1, r: 2 })] }),
      library(),
      on,
    );
    expect(canSee(kit.ctx, kit.get("o"), kit.get("far"))).toBe(false);
    expect(canSee(kit.ctx, kit.get("o"), kit.get("near"))).toBe(true);
    expect(canSee(kit.ctx, kit.get("near"), kit.get("o"))).toBe(true);
  });
});

describe("intel and sighting", () => {
  const field = () =>
    scenario({
      squads: [squad("scout", FB, { q: 0, r: 2 }), squad("close", AH, { q: 2, r: 2 }), squad("hidden", AH, { q: 6, r: 2 })],
      maxPhases: 3,
    });

  it("records what each side sees and emits `sighted` only when an enemy comes into view", () => {
    const kit = actionContext(field(), library(), on);
    expect(kit.state.intel.free_banners?.close?.visible).toBe(true);
    expect(kit.state.intel.free_banners?.hidden).toBeUndefined();

    const events: EventBody[] = [];
    refreshIntel(kit.ctx, (event) => events.push(event));
    expect(events).toEqual([]);

    kit.get("hidden").hex = { q: 1, r: 3 };
    refreshIntel(kit.ctx, (event) => events.push(event));
    expect(events).toEqual([{ kind: "sighted", faction: FB, squadId: "hidden", byId: "scout", hex: { q: 1, r: 3 } }]);
  });

  it("keeps the last-known position when an enemy slips out of sight", () => {
    const kit = actionContext(field(), library(), on);
    kit.get("close").hex = { q: 5, r: 0 };
    refreshIntel(kit.ctx);
    expect(kit.state.intel.free_banners?.close).toMatchObject({ visible: false, hex: { q: 2, r: 2 } });
  });

  it("is empty with fortune off", () => {
    const state = createInitialState(field());
    expect(state.intel).toEqual({});
  });
});

describe("visibleState", () => {
  const field = scenario({
    squads: [
      squad("scout", FB, { q: 0, r: 2 }),
      squad("close", AH, { q: 2, r: 2 }, { doctrineId: "iron_tide" }),
      squad("hidden", AH, { q: 6, r: 2 }),
    ],
  });

  it("shows own and sighted squads, hides the unseen, and never leaks the rng state", () => {
    const view = visibleState(createInitialState(field, on), FB);
    expect(view.viewer).toBe(FB);
    expect(view.squads.map((item) => item.id)).toEqual(["scout", "close"]);
    expect(view.squads[1]).toMatchObject({ doctrineId: "iron_tide", lastKnown: false });
    expect("rngState" in view).toBe(false);
    expect("intel" in view).toBe(false);
  });

  it("shows a lost enemy at its last-known hex with its doctrine hidden", () => {
    const state = createInitialState(field, on);
    state.squads[1].hex = { q: 6, r: 0 };
    state.squads[1].strength = 10;
    refreshIntel({ state, scenario: field });
    const close = visibleState(state, FB).squads.find((item) => item.id === "close");
    expect(close).toMatchObject({ hex: { q: 2, r: 2 }, strength: 80, doctrineId: null, lastKnown: true });
  });

  it("is pure and reveals everything with fortune off", () => {
    const state = createInitialState(field);
    const snapshot = structuredClone(state);
    const view = visibleState(state, FB);
    expect(view.squads).toHaveLength(3);
    view.squads[0].hex!.q = 99;
    expect(state).toEqual(snapshot);
  });
});

describe("fogged decisions", () => {
  it("the player's squads only react to enemies their side can see; the Host is omniscient", () => {
    const board = openBoard(7, 5, { "1,2": "ruin" });
    const scen = scenario({
      board,
      squads: [squad("p", FB, { q: 0, r: 2 }), squad("h", AH, { q: 2, r: 2 })],
    });
    const fogged = actionContext(scen, library(), on);
    expect(perceive(fogged.ctx, fogged.get("p")).enemies).toEqual([]);
    expect(evaluateCondition(fogged.ctx, fogged.get("p"), { kind: "enemyWithin", range: 2 })).toBe(false);
    expect(evaluateCondition(fogged.ctx, fogged.get("h"), { kind: "enemyWithin", range: 2 })).toBe(true);

    const clear = actionContext(scen, library());
    expect(evaluateCondition(clear.ctx, clear.get("p"), { kind: "enemyWithin", range: 2 })).toBe(true);
  });

  it("judges an enemy's support only by the enemies it can see (hidden supporters do not count)", () => {
    // E is in sight (2 hexes); its supporter S stands 3 hexes away, out of sight.
    const scen = scenario({
      squads: [squad("p", FB, { q: 0, r: 2 }), squad("E", AH, { q: 2, r: 2 }), squad("S", AH, { q: 3, r: 2 })],
    });
    const overextended = { kind: "enemyOverextended", range: 2 } as const;
    const fogged = actionContext(scen, library(), on);
    expect(perceive(fogged.ctx, fogged.get("p")).enemies.map((enemy) => enemy.id)).toEqual(["E"]);
    expect(evaluateCondition(fogged.ctx, fogged.get("p"), overextended)).toBe(true);
    const clear = actionContext(scen, library());
    expect(evaluateCondition(clear.ctx, clear.get("p"), overextended)).toBe(false);

    // The decision is made on what it sees; the consequence lands on the true state.
    executeAction(fogged.ctx, fogged.get("p"), { kind: "counterCharge", target: { kind: "overextendedEnemy", range: 2 } });
    expect(fogged.events.find((event) => event.kind === "engagement")).toMatchObject({ defenderId: "E", reckless: true });
  });

  it("falls back from the enemies it can see, not from hidden ones", () => {
    // V is adjacent (seen); H is 3 hexes off (hidden). Omniscient, H would pull the retreat north.
    const scen = scenario({
      squads: [squad("p", FB, { q: 3, r: 2 }), squad("V", AH, { q: 2, r: 2 }), squad("H", AH, { q: 6, r: 2 })],
    });
    const retreat = (fortune: "on" | "off") => {
      const kit = actionContext(scen, library(), { fortune });
      executeAction(kit.ctx, kit.get("p"), { kind: "fallBack", hexes: 1 });
      return kit.get("p").hex;
    };
    expect(retreat("on")).toEqual({ q: 4, r: 2 });
    expect(retreat("off")).toEqual({ q: 4, r: 1 });
  });

  it("changes behaviour in a real phase", () => {
    const board = openBoard(7, 5, { "1,2": "ruin" });
    const wary = doctrine("wary", FB, [
      [{ kind: "enemyWithin", range: 2 }, { kind: "fallBack", hexes: 1 }],
      [{ kind: "always" }, { kind: "hold" }],
    ]);
    const scen = scenario({
      board,
      squads: [squad("p", FB, { q: 0, r: 2 }, { doctrineId: "wary" }), squad("h", AH, { q: 2, r: 2 })],
      maxPhases: 2,
    });
    const fired = (fortune: "on" | "off") =>
      resolvePhase(createInitialState(scen, { fortune }), {}, scen, { doctrines: library(wary) })
        .events.filter((event) => event.kind === "ruleFired" && event.squadId === "p")
        .map((event) => ("ruleId" in event ? event.ruleId : ""));
    expect(fired("off")[0]).toBe("wary_0");
    expect(fired("on")[0]).toBe("wary_1");
  });
});
