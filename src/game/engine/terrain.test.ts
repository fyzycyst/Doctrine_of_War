// Marsh, reed banks, grey rain, noncombatants, the escort rule and withdrawal toward
// the line of retreat.
import { describe, expect, it } from "vitest";
import { executeAction } from "./actions";
import { canSee, sightRangeAt, timeOfDayAt } from "./fog";
import { planAdvance } from "./movement";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { chooseRule, evaluateCondition } from "./rules";
import { doctrineLibrary } from "./doctrines";
import { actionContext, kinds, library, openBoard, scenario, squad } from "./testKit";

const FB = "free_banners" as const;
const AH = "ashen_host" as const;

describe("marsh and reeds", () => {
  it("marsh ends a move and gives no footing to brace on", () => {
    const board = openBoard(7, 5, { "1,2": "marsh" });
    const kit = actionContext(scenario({ board, squads: [squad("cav", FB, { q: 0, r: 2 }, { role: "cavalry" }), squad("e", AH, { q: 6, r: 2 })] }));
    expect(planAdvance(kit.state, board, kit.get("cav"), [{ q: 5, r: 2 }], 2)).toEqual([{ q: 0, r: 2 }, { q: 1, r: 2 }]);
    kit.get("cav").hex = { q: 1, r: 2 };
    executeAction(kit.ctx, kit.get("cav"), { kind: "hold" });
    expect(kit.get("cav").braced).toBe(false);
    kit.get("cav").hex = { q: 2, r: 2 };
    executeAction(kit.ctx, kit.get("cav"), { kind: "hold" });
    expect(kit.get("cav").braced).toBe(true);
  });

  it("reed banks hide what lies behind them", () => {
    const board = openBoard(7, 5, { "1,2": "reeds" });
    const kit = actionContext(
      scenario({ board, squads: [squad("o", FB, { q: 0, r: 2 }), squad("far", AH, { q: 2, r: 2 })] }),
      library(),
      { fortune: "on" },
    );
    expect(canSee(kit.ctx, kit.get("o"), kit.get("far"))).toBe(false);
  });

  it("grey rain and the hour before dawn cut sight; sunrise restores it", () => {
    const base = scenario({ squads: [squad("o", FB, { q: 0, r: 2 }), squad("e", AH, { q: 6, r: 2 })] });
    const hex = { q: 0, r: 2 };
    expect(sightRangeAt({ ...base, timeOfDay: "rainGrey" }, "clear", hex)).toBe(1);
    expect(sightRangeAt(base, "clear", hex, "predawn")).toBe(1);
    expect(sightRangeAt(base, "clear", hex, "sunrise")).toBe(2);
    const dawn = { ...base, timeOfDay: "predawn" as const, timeOfDayByPhase: { 3: "sunrise" as const } };
    expect([1, 2, 3].map((phase) => timeOfDayAt(dawn, phase))).toEqual(["predawn", "predawn", "sunrise"]);
  });

  it("tracks the hour in state, phase by phase", () => {
    const dawn = scenario({
      squads: [squad("o", FB, { q: 0, r: 2 }), squad("e", AH, { q: 6, r: 2 })],
      timeOfDay: "predawn",
      timeOfDayByPhase: { 2: "sunrise" },
      maxPhases: 3,
    });
    const start = createInitialState(dawn);
    expect(start.timeOfDay).toBe("predawn");
    const first = resolvePhase(start, {}, dawn, { doctrines: library() });
    // The hour turns with the phase: the command window for phase 2 already sees by sunrise.
    expect(first.state.phase).toBe(2);
    expect(first.state.timeOfDay).toBe("sunrise");
    const second = resolvePhase(first.state, {}, dawn, { doctrines: library() });
    // Phase 3 has no override, so it is back to the scenario's hour.
    expect([second.state.phase, second.state.timeOfDay]).toEqual([3, "predawn"]);
  });
});

describe("noncombatants and their escort", () => {
  const field = (extra: Parameters<typeof scenario>[0] | null = null) =>
    scenario({
      ...(extra ?? {}),
      squads: [
        squad("col", FB, { q: 3, r: 2 }, { noncombatant: true, cohesion: 40, doctrineId: "keep_the_column_moving" }),
        squad("std", FB, { q: 1, r: 2 }, { doctrineId: "rescue_standard" }),
        squad("e", AH, { q: 6, r: 0 }),
      ],
    });

  it("a noncombatant never strikes", () => {
    const kit = actionContext(scenario({ squads: [squad("col", FB, { q: 2, r: 2 }, { noncombatant: true }), squad("e", AH, { q: 3, r: 2 })] }));
    executeAction(kit.ctx, kit.get("col"), { kind: "attack", target: { kind: "nearestEnemy" } });
    expect(kit.events).toEqual([{ kind: "blocked", squadId: "col", reason: "does not fight" }]);
  });

  it("the Standard marches to the column when it pulls ahead, then rallies it first", () => {
    const kit = actionContext(field());
    const standard = doctrineLibrary.rescue_standard;
    expect(evaluateCondition(kit.ctx, kit.get("std"), { kind: "wardNear", minRange: 2, range: 3 })).toBe(true);
    expect(chooseRule(kit.ctx, kit.get("std"), standard)?.id).toBe("rs_escort");
    executeAction(kit.ctx, kit.get("std"), { kind: "advance", toward: { kind: "ward" } });
    expect(kit.get("std").hex).toEqual({ q: 2, r: 2 });
    expect(chooseRule(kit.ctx, kit.get("std"), standard)?.id).toBe("rs_rally");
    executeAction(kit.ctx, kit.get("std"), { kind: "rally" });
    expect(kit.events.at(-1)).toMatchObject({ kind: "rally", targetId: "col" });
  });

  it("the escort rule is inert where there is no column", () => {
    const kit = actionContext(scenario({ squads: [squad("std", FB, { q: 1, r: 2 }), squad("e", AH, { q: 6, r: 0 })] }));
    expect(evaluateCondition(kit.ctx, kit.get("std"), { kind: "wardNear", range: 3 })).toBe(false);
    expect(evaluateCondition(kit.ctx, kit.get("std"), { kind: "retreatOpen" })).toBe(false);
  });

  it("Fighting Withdrawal walks toward the line of retreat and falls back toward it", () => {
    const edge = [{ q: 0, r: 4 }, { q: 1, r: 4 }, { q: 2, r: 4 }, { q: 3, r: 4 }, { q: 4, r: 4 }, { q: 5, r: 4 }, { q: 6, r: 4 }];
    const withdraw = scenario({
      winCondition: { kind: "escapeEdge", edgeHexes: edge, count: 1 },
      squads: [squad("fw", FB, { q: 3, r: 1 }, { doctrineId: "fighting_withdrawal" }), squad("e", AH, { q: 6, r: 0 })],
    });
    const kit = actionContext(withdraw);
    expect(chooseRule(kit.ctx, kit.get("fw"), doctrineLibrary.fighting_withdrawal)?.id).toBe("fw_retreat");
    const { events, state } = resolvePhase(createInitialState(withdraw), {}, withdraw, { doctrines: library() });
    expect(kinds(events)).toContain("exit");
    expect(state.status).toBe("victory");
  });
});
