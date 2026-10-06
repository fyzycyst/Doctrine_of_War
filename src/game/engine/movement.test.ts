import { describe, expect, it } from "vitest";
import { executeAction } from "./actions";
import { canEnter, planAdvance, planFallBack, planRoute } from "./movement";
import { actionContext, kinds, openBoard, scenario, squad } from "./testKit";

const FB = "free_banners" as const;
const AH = "ashen_host" as const;
const toward = { kind: "advance", toward: { kind: "nearestEnemy" } } as const;

describe("movement", () => {
  it("advances one hex along a shortest path for a speed-1 squad", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 0, r: 2 }), squad("e", AH, { q: 5, r: 2 })] }));
    executeAction(kit.ctx, kit.get("a"), toward);
    expect(kit.get("a").hex).toEqual({ q: 1, r: 2 });
    expect(kit.events).toEqual([
      { kind: "move", squadId: "a", path: [{ q: 0, r: 2 }, { q: 1, r: 2 }], from: { q: 0, r: 2 }, to: { q: 1, r: 2 }, reason: "advance" },
    ]);
  });

  it("routes around an occupied hex instead of entering it", () => {
    const kit = actionContext(
      scenario({
        squads: [squad("a", FB, { q: 0, r: 2 }), squad("ally", FB, { q: 1, r: 2 }), squad("e", AH, { q: 5, r: 2 })],
      }),
    );
    executeAction(kit.ctx, kit.get("a"), toward);
    expect(kit.get("a").hex).not.toEqual({ q: 1, r: 2 });
    expect(kit.get("a").hex).not.toEqual({ q: 0, r: 2 });
  });

  it("is blocked by occupants and walls in a corridor", () => {
    const corridor = openBoard(7, 1, { "2,0": "wall" });
    const walled = actionContext(
      scenario({ board: corridor, squads: [squad("a", FB, { q: 0, r: 0 }), squad("e", AH, { q: 5, r: 0 })] }),
    );
    executeAction(walled.ctx, walled.get("a"), toward);
    // It can creep to the wall but no further.
    expect(walled.get("a").hex).toEqual({ q: 1, r: 0 });
    executeAction(walled.ctx, walled.get("a"), toward);
    expect(walled.get("a").hex).toEqual({ q: 1, r: 0 });
    expect(walled.events.at(-1)).toMatchObject({ kind: "blocked", reason: "path blocked" });

    const crowded = actionContext(
      scenario({
        board: openBoard(7, 1),
        squads: [squad("a", FB, { q: 0, r: 0 }), squad("ally", FB, { q: 1, r: 0 }), squad("e", AH, { q: 5, r: 0 })],
      }),
    );
    executeAction(crowded.ctx, crowded.get("a"), toward);
    expect(crowded.get("a").hex).toEqual({ q: 0, r: 0 });
    expect(kinds(crowded.events)).toEqual(["blocked"]);
  });

  it("never enters objective hexes, walls, off-board or occupied hexes", () => {
    const kit = actionContext(
      scenario({
        board: openBoard(7, 5, { "3,3": "wall" }),
        objectives: [{ id: "o", name: "O", description: "", hex: { q: 5, r: 2 }, integrity: 10, defender: FB }],
        squads: [squad("a", FB, { q: 0, r: 0 })],
      }),
    );
    expect(canEnter(kit.state, kit.ctx.scenario.board, { q: 1, r: 1 })).toBe(true);
    expect(canEnter(kit.state, kit.ctx.scenario.board, { q: 0, r: 0 })).toBe(false);
    expect(canEnter(kit.state, kit.ctx.scenario.board, { q: 3, r: 3 })).toBe(false);
    expect(canEnter(kit.state, kit.ctx.scenario.board, { q: 5, r: 2 })).toBe(false);
    expect(canEnter(kit.state, kit.ctx.scenario.board, { q: 9, r: 0 })).toBe(false);
  });

  it("closes in as far as it can when every goal hex is occupied", () => {
    const kit = actionContext(
      scenario({
        board: openBoard(7, 1),
        squads: [squad("a", FB, { q: 0, r: 0 }), squad("guard", AH, { q: 5, r: 0 }), squad("e", AH, { q: 6, r: 0 })],
      }),
    );
    const path = planAdvance(kit.state, kit.ctx.scenario.board, kit.get("a"), [{ q: 5, r: 0 }], 1);
    expect(path).toEqual([{ q: 0, r: 0 }, { q: 1, r: 0 }]);
  });

  it("stops a fast squad when it enters an enemy zone of control", () => {
    const free = actionContext(
      scenario({ squads: [squad("cav", FB, { q: 0, r: 2 }, { role: "cavalry" }), squad("t", AH, { q: 6, r: 2 })] }),
    );
    executeAction(free.ctx, free.get("cav"), toward);
    expect(free.events[0]).toMatchObject({ kind: "move" });
    expect((free.events[0] as { path: unknown[] }).path).toHaveLength(3);

    const screened = actionContext(
      scenario({
        squads: [
          squad("cav", FB, { q: 0, r: 2 }, { role: "cavalry" }),
          squad("t", AH, { q: 6, r: 2 }, { strength: 10 }),
          squad("screen", AH, { q: 2, r: 1 }),
        ],
      }),
    );
    executeAction(screened.ctx, screened.get("cav"), { kind: "advance", toward: { kind: "weakestEnemy", stat: "strength", range: 9 } });
    const move = screened.events[0] as { kind: string; path: { q: number; r: number }[] };
    expect(move.kind).toBe("move");
    expect(move.path).toHaveLength(2);
  });

  it("falls back away from the enemy, ignoring zones of control", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 3, r: 2 }), squad("e", AH, { q: 2, r: 2 })] }));
    const path = planFallBack(kit.state, kit.ctx.scenario.board, kit.get("a"), 2, [kit.get("e")]);
    expect(path).toHaveLength(3);
    expect(path[0]).toEqual({ q: 3, r: 2 });
    expect(path[2]).toEqual({ q: 5, r: 2 });
  });

  it("braces instead when cornered", () => {
    const kit = actionContext(
      scenario({ board: openBoard(3, 1), squads: [squad("a", FB, { q: 2, r: 0 }), squad("e", AH, { q: 1, r: 0 })] }),
    );
    executeAction(kit.ctx, kit.get("a"), { kind: "fallBack", hexes: 1 });
    expect(kit.get("a").hex).toEqual({ q: 2, r: 0 });
    expect(kit.get("a").braced).toBe(true);
    expect(kit.events).toEqual([{ kind: "blocked", squadId: "a", reason: "cornered, bracing instead" }]);
  });

  it("plans a route through an unseen enemy as open ground (C5 fog), and the walk stops on contact", () => {
    const board = openBoard(5, 3);
    const goal = { q: 4, r: 1 };
    const unseen = { q: 3, r: 1 };
    const clear = actionContext(scenario({ board, squads: [squad("a", FB, { q: 0, r: 1 })] }));
    const hidden = actionContext(scenario({ board, squads: [squad("a", FB, { q: 0, r: 1 }), squad("h", AH, unseen)] }));
    const route = planRoute(clear.state, board, clear.get("a"), [goal]);
    // Told the enemy is unseen, the route is the one it would take on an empty field...
    expect(planRoute(hidden.state, board, hidden.get("a"), [goal], [unseen])).toEqual(route);
    // ...where the true-state route (the old leak) bends around it.
    expect(planRoute(hidden.state, board, hidden.get("a"), [goal])).not.toEqual(route);
    // Walking it, the mover runs into the enemy: it stops on entering its zone of control.
    expect(planAdvance(hidden.state, board, hidden.get("a"), [goal], 5, [unseen]).at(-1)).toEqual({ q: 2, r: 1 });
  });
});
