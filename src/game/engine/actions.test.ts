import { describe, expect, it } from "vitest";
import { engagementLosses, executeAction, RALLY_BASE, SIEGE_OBJECTIVE_DAMAGE } from "./actions";
import { actionContext, kinds, scenario, squad } from "./testKit";
import type { ObjectiveSetup } from "./types";

const FB = "free_banners" as const;
const AH = "ashen_host" as const;
const nearest = { kind: "nearestEnemy" } as const;
const gate: ObjectiveSetup = {
  id: "gate",
  name: "Gate",
  description: "",
  hex: { q: 5, r: 2 },
  integrity: 100,
  defender: FB,
};

describe("actions", () => {
  it("hold braces the squad, and bracing reduces losses when struck", () => {
    const kit = actionContext(
      scenario({ squads: [squad("a", AH, { q: 1, r: 2 }), squad("d", FB, { q: 2, r: 2 }, { strength: 100 })] }),
    );
    const unbraced = engagementLosses(kit.ctx, kit.get("a"), kit.get("d"), false);
    executeAction(kit.ctx, kit.get("d"), { kind: "hold" });
    expect(kit.get("d").braced).toBe(true);
    expect(kit.events).toEqual([]);
    const braced = engagementLosses(kit.ctx, kit.get("a"), kit.get("d"), false);
    expect(braced.defenderCohesion).toBeLessThan(unbraced.defenderCohesion);
    expect(braced.attackerStrength + braced.attackerCohesion).toBeGreaterThan(
      unbraced.attackerStrength + unbraced.attackerCohesion,
    );
  });

  it("advance moves toward the target, and braces instead once in position", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 1, r: 2 }), squad("e", AH, { q: 3, r: 2 })] }));
    executeAction(kit.ctx, kit.get("a"), { kind: "advance", toward: nearest });
    expect(kit.get("a").hex).toEqual({ q: 2, r: 2 });
    executeAction(kit.ctx, kit.get("a"), { kind: "advance", toward: nearest });
    expect(kit.get("a").hex).toEqual({ q: 2, r: 2 });
    expect(kit.get("a").braced).toBe(true);
    expect(kinds(kit.events)).toEqual(["move"]);
  });

  it("attack strikes an adjacent enemy and both sides take losses", () => {
    const kit = actionContext(scenario({ squads: [squad("a", AH, { q: 1, r: 2 }), squad("d", FB, { q: 2, r: 2 })] }));
    executeAction(kit.ctx, kit.get("a"), { kind: "attack", target: nearest });
    expect(kit.events).toHaveLength(1);
    const engagement = kit.events[0];
    expect(engagement).toMatchObject({ kind: "engagement", attackerId: "a", defenderId: "d", charge: false });
    expect(kit.get("d").strength).toBeLessThan(80);
    expect(kit.get("d").cohesion).toBeLessThan(80);
    expect(kit.get("a").strength).toBeLessThan(80);
  });

  it("attack on a distant target only closes the distance this activation", () => {
    const kit = actionContext(scenario({ squads: [squad("a", AH, { q: 0, r: 2 }), squad("d", FB, { q: 3, r: 2 })] }));
    executeAction(kit.ctx, kit.get("a"), { kind: "attack", target: nearest });
    expect(kinds(kit.events)).toEqual(["move"]);
  });

  it("attack on an adjacent objective damages it; siege hits harder; harassment halves it", () => {
    const run = (role: "siege" | "frontline", harassed: boolean) => {
      const squads = [squad("a", AH, { q: 4, r: 2 }, { role, strength: 100 })];
      if (harassed) {
        squads.push(squad("d", FB, { q: 3, r: 2 }));
      }
      const kit = actionContext(scenario({ squads, objectives: [gate] }));
      executeAction(kit.ctx, kit.get("a"), { kind: "attack", target: { kind: "objective", side: "enemy" } });
      return kit;
    };
    const siege = run("siege", false);
    expect(siege.events).toEqual([
      { kind: "objectiveDamage", objectiveId: "gate", attackerId: "a", hex: gate.hex, oldIntegrity: 100, newIntegrity: 100 - SIEGE_OBJECTIVE_DAMAGE },
    ]);
    const infantry = run("frontline", false).state.objectives[0].integrity;
    expect(100 - infantry).toBeLessThan(SIEGE_OBJECTIVE_DAMAGE);
    expect(run("siege", true).state.objectives[0].integrity).toBe(100 - SIEGE_OBJECTIVE_DAMAGE / 2);
  });

  it("counterCharge moves up to speed + 1 and strikes on arrival with the charge bonus", () => {
    const kit = actionContext(scenario({ squads: [squad("c", FB, { q: 0, r: 2 }), squad("e", AH, { q: 3, r: 2 })] }));
    executeAction(kit.ctx, kit.get("c"), { kind: "counterCharge", target: nearest });
    expect(kinds(kit.events)).toEqual(["move", "engagement"]);
    expect(kit.events[0]).toMatchObject({ reason: "charge" });
    expect(kit.events[1]).toMatchObject({ charge: true });

    const plain = engagementLosses(kit.ctx, kit.get("c"), kit.get("e"), false);
    const charged = engagementLosses(kit.ctx, kit.get("c"), kit.get("e"), true);
    expect(charged.defenderStrength).toBeGreaterThan(plain.defenderStrength);
  });

  it("counterCharge that falls short is reported", () => {
    const kit = actionContext(scenario({ squads: [squad("c", FB, { q: 0, r: 2 }), squad("e", AH, { q: 6, r: 2 })] }));
    executeAction(kit.ctx, kit.get("c"), { kind: "counterCharge", target: nearest });
    expect(kinds(kit.events)).toEqual(["move", "blocked"]);
  });

  it("fallBack moves away from the enemy", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 3, r: 2 }), squad("e", AH, { q: 2, r: 2 })] }));
    executeAction(kit.ctx, kit.get("a"), { kind: "fallBack", hexes: 1 });
    expect(kit.events[0]).toMatchObject({ kind: "move", reason: "fallBack" });
    expect(kit.get("a").hex).toEqual({ q: 4, r: 2 });
  });

  it("rally restores cohesion to the weakest adjacent ally, capped at 100", () => {
    const kit = actionContext(
      scenario({
        squads: [
          squad("r", FB, { q: 2, r: 2 }),
          squad("low", FB, { q: 3, r: 2 }, { cohesion: 30 }),
          squad("lower_far", FB, { q: 5, r: 2 }, { cohesion: 10 }),
          squad("nearly_full", FB, { q: 1, r: 2 }, { cohesion: 99 }),
        ],
      }),
    );
    executeAction(kit.ctx, kit.get("r"), { kind: "rally" });
    expect(kit.events).toEqual([{ kind: "rally", sourceId: "r", targetId: "low", restored: RALLY_BASE }]);
    expect(kit.get("low").cohesion).toBe(30 + RALLY_BASE);

    kit.get("low").cohesion = 100;
    executeAction(kit.ctx, kit.get("r"), { kind: "rally" });
    expect(kit.events.at(-1)).toEqual({ kind: "rally", sourceId: "r", targetId: "nearly_full", restored: 1 });
  });

  it("rally with no adjacent ally is blocked", () => {
    const kit = actionContext(scenario({ squads: [squad("r", FB, { q: 2, r: 2 })] }));
    executeAction(kit.ctx, kit.get("r"), { kind: "rally" });
    expect(kit.events).toEqual([{ kind: "blocked", squadId: "r", reason: "no ally to rally" }]);
  });

  it("an action with no valid target is blocked", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 2, r: 2 })] }));
    executeAction(kit.ctx, kit.get("a"), { kind: "attack", target: nearest });
    expect(kit.events).toEqual([{ kind: "blocked", squadId: "a", reason: "no target" }]);
  });
});

describe("routing", () => {
  it("a squad at 0 cohesion routs and leaves the board", () => {
    const kit = actionContext(
      scenario({ squads: [squad("a", AH, { q: 1, r: 2 }, { strength: 100 }), squad("d", FB, { q: 2, r: 2 }, { cohesion: 3 })] }),
    );
    executeAction(kit.ctx, kit.get("a"), { kind: "attack", target: nearest });
    expect(kinds(kit.events)).toEqual(["engagement", "rout"]);
    expect(kit.events[1]).toEqual({ kind: "rout", squadId: "d", hex: { q: 2, r: 2 }, cause: "cohesion" });
    expect(kit.get("d").status).toBe("routed");
    expect(kit.get("d").hex).toBeNull();
  });

  it("a squad at 0 strength is destroyed", () => {
    const kit = actionContext(
      scenario({ squads: [squad("a", AH, { q: 1, r: 2 }, { strength: 100 }), squad("d", FB, { q: 2, r: 2 }, { strength: 2 })] }),
    );
    executeAction(kit.ctx, kit.get("a"), { kind: "attack", target: nearest });
    expect(kit.events[1]).toMatchObject({ kind: "rout", cause: "strength" });
    expect(kit.get("d").status).toBe("destroyed");
  });

  it("an attacker can rout from the riposte", () => {
    const kit = actionContext(
      scenario({ squads: [squad("a", AH, { q: 1, r: 2 }, { cohesion: 1 }), squad("d", FB, { q: 2, r: 2 })] }),
    );
    executeAction(kit.ctx, kit.get("a"), { kind: "attack", target: nearest });
    expect(kit.events[1]).toMatchObject({ kind: "rout", squadId: "a" });
  });

  it("a routed squad frees its hex for movement", () => {
    const kit = actionContext(
      scenario({
        squads: [
          squad("a", AH, { q: 1, r: 2 }, { strength: 100 }),
          squad("d", FB, { q: 2, r: 2 }, { cohesion: 1 }),
          squad("b", FB, { q: 3, r: 2 }),
        ],
      }),
    );
    executeAction(kit.ctx, kit.get("a"), { kind: "attack", target: nearest });
    executeAction(kit.ctx, kit.get("a"), { kind: "advance", toward: nearest });
    expect(kit.get("a").hex).toEqual({ q: 2, r: 2 });
  });
});
