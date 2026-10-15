import { describe, expect, it } from "vitest";
import { doctrineLibrary } from "./doctrines";
import { chooseRule, evaluateCondition, resolveTarget } from "./rules";
import { actionContext, doctrine, scenario, squad } from "./testKit";
import type { Condition, SquadSetup } from "./types";

const FB = "free_banners" as const;
const AH = "ashen_host" as const;

function check(squads: SquadSetup[], condition: Condition, extra: Parameters<typeof scenario>[0] | null = null) {
  const kit = actionContext(scenario({ ...(extra ?? {}), squads }));
  return evaluateCondition(kit.ctx, kit.get(squads[0].id), condition);
}

describe("conditions", () => {
  it("always matches", () => {
    expect(check([squad("a", FB, { q: 1, r: 1 })], { kind: "always" })).toBe(true);
  });

  it("selfCohesionBelow / selfStrengthBelow are strict thresholds", () => {
    const me = [squad("a", FB, { q: 1, r: 1 }, { cohesion: 40, strength: 30 })];
    expect(check(me, { kind: "selfCohesionBelow", value: 41 })).toBe(true);
    expect(check(me, { kind: "selfCohesionBelow", value: 40 })).toBe(false);
    expect(check(me, { kind: "selfStrengthBelow", value: 31 })).toBe(true);
    expect(check(me, { kind: "selfStrengthBelow", value: 30 })).toBe(false);
  });

  it("enemyAdjacent only sees enemies one hex away", () => {
    const me = squad("a", FB, { q: 1, r: 1 });
    expect(check([me, squad("e", AH, { q: 2, r: 1 })], { kind: "enemyAdjacent" })).toBe(true);
    expect(check([me, squad("e", AH, { q: 3, r: 1 })], { kind: "enemyAdjacent" })).toBe(false);
    expect(check([me, squad("f", FB, { q: 2, r: 1 })], { kind: "enemyAdjacent" })).toBe(false);
  });

  it("enemyWithin respects range", () => {
    const me = squad("a", FB, { q: 1, r: 1 });
    expect(check([me, squad("e", AH, { q: 3, r: 1 })], { kind: "enemyWithin", range: 2 })).toBe(true);
    expect(check([me, squad("e", AH, { q: 4, r: 1 })], { kind: "enemyWithin", range: 2 })).toBe(false);
  });

  it("enemyBelow needs a weak enemy inside range", () => {
    const me = squad("a", FB, { q: 1, r: 1 });
    const weak = squad("e", AH, { q: 3, r: 1 }, { cohesion: 30 });
    expect(check([me, weak], { kind: "enemyBelow", stat: "cohesion", value: 40, range: 3 })).toBe(true);
    expect(check([me, weak], { kind: "enemyBelow", stat: "cohesion", value: 30, range: 3 })).toBe(false);
    expect(check([me, weak], { kind: "enemyBelow", stat: "cohesion", value: 40, range: 1 })).toBe(false);
  });

  it("allyAdjacentBelow checks adjacent allies only", () => {
    const me = squad("a", FB, { q: 1, r: 1 });
    const hurt = (hex: { q: number; r: number }) => squad("b", FB, hex, { cohesion: 50 });
    const condition: Condition = { kind: "allyAdjacentBelow", stat: "cohesion", value: 60 };
    expect(check([me, hurt({ q: 2, r: 1 })], condition)).toBe(true);
    expect(check([me, hurt({ q: 3, r: 1 })], condition)).toBe(false);
  });

  it("allyBelow looks across the whole board but never at self", () => {
    const condition: Condition = { kind: "allyBelow", stat: "strength", value: 40 };
    const me = squad("a", FB, { q: 1, r: 1 }, { strength: 10 });
    expect(check([me], condition)).toBe(false);
    expect(check([me, squad("b", FB, { q: 6, r: 4 }, { strength: 20 })], condition)).toBe(true);
  });

  it("enemyOverextended matches a lone enemy in range", () => {
    const me = squad("a", FB, { q: 1, r: 1 });
    const lone = squad("e", AH, { q: 3, r: 1 });
    const buddy = squad("e2", AH, { q: 4, r: 1 });
    expect(check([me, lone], { kind: "enemyOverextended" })).toBe(true);
    expect(check([me, lone, buddy], { kind: "enemyOverextended" })).toBe(false);
    expect(check([me, lone], { kind: "enemyOverextended", range: 1 })).toBe(false);
  });

  it("objectiveThreatened fires when an enemy is within 2 of an objective this faction defends", () => {
    const objectives = [
      { id: "gate", name: "Gate", description: "", hex: { q: 5, r: 2 }, integrity: 100, defender: FB },
    ];
    const me = squad("a", FB, { q: 0, r: 0 });
    expect(check([me, squad("e", AH, { q: 3, r: 2 })], { kind: "objectiveThreatened" }, { squads: [], objectives })).toBe(true);
    expect(check([me, squad("e", AH, { q: 2, r: 2 })], { kind: "objectiveThreatened" }, { squads: [], objectives })).toBe(false);
    expect(
      check([me, squad("e", AH, { q: 3, r: 2 })], { kind: "objectiveThreatened", objectiveId: "other" }, { squads: [], objectives }),
    ).toBe(false);
    // An attacker does not "defend" the objective, so it is never threatened from its point of view.
    expect(
      check([squad("e", AH, { q: 3, r: 2 }), me], { kind: "objectiveThreatened" }, { squads: [], objectives }),
    ).toBe(false);
  });

  it("ignores squads that are no longer active", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 1, r: 1 }), squad("e", AH, { q: 2, r: 1 })] }));
    const enemy = kit.get("e");
    enemy.status = "routed";
    enemy.hex = null as never;
    expect(evaluateCondition(kit.ctx, kit.get("a"), { kind: "enemyAdjacent" })).toBe(false);
  });
});

describe("target selectors", () => {
  const field = [
    squad("a", FB, { q: 1, r: 1 }),
    squad("ally_hurt", FB, { q: 1, r: 3 }, { cohesion: 30 }),
    squad("ally_ok", FB, { q: 0, r: 1 }, { cohesion: 90 }),
    squad("far_weak", AH, { q: 4, r: 3 }, { cohesion: 10, strength: 10 }),
    squad("near", AH, { q: 3, r: 1 }, { cohesion: 70 }),
    squad("near_friend", AH, { q: 4, r: 1 }, { cohesion: 60 }),
  ];
  const kit = actionContext(scenario({ squads: field }));
  const me = kit.get("a");
  const pick = (selector: Parameters<typeof resolveTarget>[2]) => {
    const target = resolveTarget(kit.ctx, me, selector);
    return target?.kind === "squad" ? target.squad.id : target;
  };

  it("nearestEnemy picks the closest", () => {
    expect(pick({ kind: "nearestEnemy" })).toBe("near");
  });

  it("weakestEnemy sorts by stat and honours range", () => {
    expect(pick({ kind: "weakestEnemy", stat: "cohesion" })).toBe("far_weak");
    expect(pick({ kind: "weakestEnemy", stat: "cohesion", range: 3 })).toBe("near_friend");
    expect(pick({ kind: "weakestEnemy", stat: "cohesion", range: 1 })).toBeNull();
  });

  it("overextendedEnemy picks only enemies with no adjacent friends", () => {
    expect(pick({ kind: "overextendedEnemy", range: 5 })).toBe("far_weak");
    expect(pick({ kind: "overextendedEnemy", range: 3 })).toBeNull();
  });

  it("weakestAlly picks the lowest ally, never self", () => {
    expect(pick({ kind: "weakestAlly", stat: "cohesion" })).toBe("ally_hurt");
  });

  it("objective picks by side (own vs enemy) and optional id", () => {
    const objectives = [
      { id: "mine", name: "Mine", description: "", hex: { q: 6, r: 0 }, integrity: 50, defender: FB },
      { id: "theirs", name: "Theirs", description: "", hex: { q: 6, r: 4 }, integrity: 50, defender: AH },
    ];
    const withObjectives = actionContext(scenario({ squads: field, objectives }));
    const pickObjective = (selector: Parameters<typeof resolveTarget>[2]) =>
      resolveTarget(withObjectives.ctx, withObjectives.get("a"), selector);
    expect(pickObjective({ kind: "objective", side: "enemy" })).toMatchObject({ objective: { id: "theirs" } });
    expect(pickObjective({ kind: "objective", side: "own" })).toMatchObject({ objective: { id: "mine" } });
    expect(pickObjective({ kind: "objective", side: "own", objectiveId: "theirs" })).toBeNull();
    withObjectives.state.objectives[1].integrity = 0;
    expect(pickObjective({ kind: "objective", side: "enemy" })).toBeNull();
  });

  it("exitEdge resolves only for the player in an escape scenario", () => {
    const edgeHexes = [{ q: 6, r: 0 }];
    const escape = actionContext(scenario({ squads: field, winCondition: { kind: "escapeEdge", edgeHexes, count: 1 } }));
    expect(resolveTarget(escape.ctx, escape.get("a"), { kind: "exitEdge" })).toEqual({ kind: "hexes", hexes: edgeHexes });
    expect(resolveTarget(escape.ctx, escape.get("near"), { kind: "exitEdge" })).toBeNull();
  });
});

describe("chooseRule", () => {
  it("takes the first matching rule, top to bottom", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 1, r: 1 }, { cohesion: 10 })] }));
    const doc = doctrine("d", FB, [
      [{ kind: "enemyAdjacent" }, { kind: "attack", target: { kind: "nearestEnemy" } }],
      [{ kind: "selfCohesionBelow", value: 20 }, { kind: "fallBack", hexes: 1 }],
      [{ kind: "always" }, { kind: "hold" }],
    ]);
    expect(chooseRule(kit.ctx, kit.get("a"), doc)?.id).toBe("d_1");
  });

  it("returns undefined when nothing matches", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 1, r: 1 })] }));
    const doc = doctrine("d", FB, [[{ kind: "enemyAdjacent" }, { kind: "hold" }]]);
    expect(chooseRule(kit.ctx, kit.get("a"), doc)).toBeUndefined();
  });

  it("Clean Counterstroke marches to a fight beyond 3 hexes, but never before there is one (T21)", () => {
    const hunt = { kind: "fightBeyond", range: 3 } as const;
    // An ally is fighting at (0,2)-(1,2); the idle company at (6,2) is beyond 3 hexes of any enemy.
    const fighting = [squad("idle", FB, { q: 6, r: 2 }), squad("ally", FB, { q: 1, r: 2 }), squad("h", AH, { q: 0, r: 2 })];
    expect(check(fighting, hunt)).toBe(true);
    const kit = actionContext(scenario({ squads: fighting }));
    expect(chooseRule(kit.ctx, kit.get("idle"), doctrineLibrary.clean_counterstroke)?.id).toBe("cc_hunt");
    expect(resolveTarget(kit.ctx, kit.get("idle"), { kind: "fightingEnemy" })).toMatchObject({ kind: "squad", squad: { id: "h" } });
    // No fight yet (the Host is still coming): it holds and watches.
    expect(check([squad("idle", FB, { q: 6, r: 2 }), squad("ally", FB, { q: 4, r: 0 }), squad("h", AH, { q: 0, r: 2 })], hunt)).toBe(false);
    // A fight within 3 hexes is this company's own: no march.
    expect(check([squad("idle", FB, { q: 3, r: 2 }), squad("ally", FB, { q: 1, r: 2 }), squad("h", AH, { q: 0, r: 2 })], hunt)).toBe(false);
  });
});
