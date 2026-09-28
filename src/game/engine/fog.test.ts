import { describe, expect, it } from "vitest";
import { executeAction } from "./actions";
import { canSee, eventsFor, hexLine, refreshIntel, sightRange, visibleState } from "./fog";
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

  it("does not learn of a rout it could not see: the silhouette keeps its last-known state", () => {
    const kit = actionContext(field(), library(), on);
    kit.get("close").hex = { q: 5, r: 0 };
    refreshIntel(kit.ctx);
    const lost = kit.get("close");
    lost.status = "routed";
    lost.hex = null as never;
    refreshIntel(kit.ctx);
    expect(kit.state.intel.free_banners?.close).toMatchObject({ visible: false, status: "active", hex: { q: 2, r: 2 } });
  });

  it("learns of a rout it watched happen", () => {
    const striker = doctrine("striker", FB, [[{ kind: "always" }, { kind: "attack", target: { kind: "nearestEnemy" } }]]);
    const scen = scenario({
      initiativeSide: FB,
      squads: [squad("p", FB, { q: 1, r: 2 }, { doctrineId: "striker", strength: 100 }), squad("h", AH, { q: 2, r: 2 }, { cohesion: 3 }), squad("h2", AH, { q: 6, r: 4 })],
      maxPhases: 2,
    });
    const { state } = resolvePhase(createInitialState(scen, on), {}, scen, { doctrines: library(striker) });
    expect(state.intel.free_banners?.h).toMatchObject({ visible: false, status: "routed", hex: null });
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

describe("dread and sight stay consistent", () => {
  it("refreshes intel after a phase-start dread rout removes the only spotter, and ends the battle", () => {
    const scen = scenario({
      squads: [
        squad("p", FB, { q: 3, r: 2 }, { resolve: -3, cohesion: 20 }),
        squad("champ", AH, { q: 1, r: 2 }, { resolve: 3, renown: { title: "The Unquenched" } }),
      ],
      maxPhases: 2,
    });
    const start = createInitialState(scen, on);
    expect(start.intel.free_banners?.champ?.visible).toBe(true);
    const { state, events } = resolvePhase(start, {}, scen, { doctrines: library() });
    expect(events.map((event) => event.kind)).toEqual(["dread", "rout", "outcome"]);
    expect(state.status).toBe("defeat");
    // p saw the champion, broke, and nobody on its side can see it any more.
    expect(state.intel.free_banners?.champ?.visible).toBe(false);
  });
});

describe("event visibility (fog of war for playback)", () => {
  // A Host squad marches along the far edge, never within Banner sight (2 hexes).
  const marcher = doctrine("marcher", AH, [[{ kind: "always" }, { kind: "advance", toward: { kind: "nearestEnemy" } }]]);
  const lookout = doctrine("lookout", FB, [[{ kind: "always" }, { kind: "hold" }]]);
  const scen = scenario({
    board: openBoard(9, 5),
    squads: [squad("watch", FB, { q: 0, r: 0 }, { doctrineId: "lookout" }), squad("far", AH, { q: 8, r: 4 }, { doctrineId: "marcher" })],
    maxPhases: 2,
  });
  const run = (fortune: "on" | "off") =>
    resolvePhase(createInitialState(scen, { fortune }), {}, scen, { doctrines: library(marcher, lookout) });

  it("hides an unseen squad's orders and path from the other side, but not from its own", () => {
    const { events, report } = run("on");
    const hostOnly = events.filter((event) => "squadId" in event && event.squadId === "far");
    expect(hostOnly.map((event) => event.kind)).toContain("ruleFired");
    expect(hostOnly.map((event) => event.kind)).toContain("move");
    for (const event of hostOnly) {
      expect(event.visibleTo).toEqual(["ashen_host"]);
    }
    expect(eventsFor(events, FB).some((event) => "squadId" in event && event.squadId === "far")).toBe(false);
    expect(eventsFor(events, AH).length).toBeGreaterThan(eventsFor(events, FB).length);
    // The player's report is built from what the player saw.
    expect(report.lines.join("\n")).not.toMatch(/\bfar\b/);
    expect(report.lines.join("\n")).toMatch(/watch/);
  });

  it("reveals a move once any hex of its path is in sight, and engagements to both sides", () => {
    const close = scenario({
      squads: [squad("watch", FB, { q: 0, r: 2 }, { doctrineId: "lookout" }), squad("near", AH, { q: 3, r: 2 }, { doctrineId: "raider" })],
      maxPhases: 2,
    });
    const raider = doctrine("raider", AH, [[{ kind: "always" }, { kind: "attack", target: { kind: "nearestEnemy" } }]]);
    const doctrines = library(raider, lookout);
    const first = resolvePhase(createInitialState(close, on), {}, close, { doctrines });
    const events = [...first.events, ...resolvePhase(first.state, {}, close, { doctrines }).events];
    // The Host's opening order was given out of sight, but the move that followed was seen.
    expect(events[0]).toMatchObject({ kind: "ruleFired", squadId: "near", visibleTo: ["ashen_host"] });
    const firstMove = events.find((event) => event.kind === "move");
    expect(firstMove?.visibleTo).toEqual(["free_banners", "ashen_host"]);
    const engagement = events.find((event) => event.kind === "engagement");
    expect(engagement?.visibleTo).toEqual(["free_banners", "ashen_host"]);
  });

  it("shows everything to everyone with fortune off", () => {
    const { events } = run("off");
    expect(events.every((event) => event.visibleTo.length === 2)).toBe(true);
    expect(eventsFor(events, FB)).toEqual(events);
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

  it("exposes only an explicit allowlist of fields", () => {
    const state = createInitialState(field, on);
    state.contacts.push("close|scout");
    state.dreaded.push("scout>close");
    const view = visibleState(state, FB);
    expect(Object.keys(view).sort()).toEqual(
      ["fortune", "maxPhases", "objectives", "phase", "scenarioId", "seed", "squads", "status", "viewer", "weather"].sort(),
    );
    expect(Object.keys(view.squads[0]).sort()).toEqual(
      ["braced", "cohesion", "doctrineId", "faction", "hex", "id", "lastKnown", "name", "resolve", "role", "status", "strength", "surging"].sort(),
    );
    expect(JSON.stringify(view)).not.toMatch(/contacts|dreaded|rngState|intel/);
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
