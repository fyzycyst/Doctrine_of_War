import { describe, expect, it } from "vitest";
import { hexDistance } from "../board";
import { BOMBARD_DAMAGE, BRACE_BITE, engagementLosses, executeAction, RALLY_BASE, SIEGE_OBJECTIVE_DAMAGE } from "./actions";
import { actionContext, kinds, openBoard, scenario, squad } from "./testKit";
import type { Action, ObjectiveSetup } from "./types";

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

describe("friendly-fire guard", () => {
  it("offensive actions only accept enemy-facing selectors (type level)", () => {
    // @ts-expect-error weakestAlly is not an EnemySelector
    const badAttack: Action = { kind: "attack", target: { kind: "weakestAlly", stat: "cohesion" } };
    // @ts-expect-error an own objective is not an EnemySelector
    const badCharge: Action = { kind: "counterCharge", target: { kind: "objective", side: "own" } };
    expect([badAttack.kind, badCharge.kind]).toEqual(["attack", "counterCharge"]);
  });

  it("refuses to strike an ally even when editor JSON bypasses the types", () => {
    const kit = actionContext(
      scenario({ squads: [squad("a", FB, { q: 1, r: 2 }), squad("friend", FB, { q: 2, r: 2 }, { cohesion: 10 })] }),
    );
    const fromJson = JSON.parse('{"kind":"attack","target":{"kind":"weakestAlly","stat":"cohesion"}}') as Action;
    executeAction(kit.ctx, kit.get("a"), fromJson);
    expect(kit.events).toEqual([{ kind: "blocked", squadId: "a", reason: "will not strike its own side" }]);
    expect(kit.get("friend")).toMatchObject({ strength: 80, cohesion: 10 });
  });

  it("refuses to batter its own objective", () => {
    const kit = actionContext(scenario({ squads: [squad("a", FB, { q: 4, r: 2 })], objectives: [gate] }));
    const fromJson = JSON.parse('{"kind":"counterCharge","target":{"kind":"objective","side":"own"}}') as Action;
    executeAction(kit.ctx, kit.get("a"), fromJson);
    expect(kit.events).toEqual([{ kind: "blocked", squadId: "a", reason: "will not strike its own side" }]);
    expect(kit.state.objectives[0].integrity).toBe(100);
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

  it("bombard hurls fire at the gate from range, and closes in when out of range", () => {
    const kit = actionContext(
      scenario({ objectives: [gate], squads: [squad("p", FB, { q: 6, r: 0 }), squad("m", AH, { q: 0, r: 2 }, { role: "siege", strength: 50 })] }),
    );
    executeAction(kit.ctx, kit.get("m"), { kind: "bombard", range: 4 });
    expect(kit.get("m").hex).toEqual({ q: 1, r: 2 });
    expect(kit.state.objectives[0].integrity).toBe(100);
    executeAction(kit.ctx, kit.get("m"), { kind: "bombard", range: 4 });
    expect(kit.events.at(-1)).toMatchObject({ kind: "objectiveDamage", attackerId: "m", newIntegrity: 100 - BOMBARD_DAMAGE / 2 });
    expect(kit.get("m").hex).toEqual({ q: 1, r: 2 });
  });

  it("a braced Shield the Line bites: blows on it cost the attacker far more than on a lighter brace", () => {
    const bout = (doctrineId: string) => {
      const kit = actionContext(
        scenario({ squads: [squad("d", FB, { q: 2, r: 2 }, { doctrineId }), squad("a", AH, { q: 3, r: 2 })] }),
      );
      kit.get("d").braced = true;
      return engagementLosses(kit.ctx, kit.get("a"), kit.get("d"), false);
    };
    const wall = bout("shield_the_line");
    const guard = bout("clean_counterstroke");
    expect(wall.attackerStrength - guard.attackerStrength).toBeGreaterThanOrEqual(2 * BRACE_BITE - 1);
    expect(wall.attackerCohesion - guard.attackerCohesion).toBeGreaterThanOrEqual(2 * BRACE_BITE - 2);
  });
});

// C4: an objective in its own race of water, reached by one dry walk (Cinder Road 2's
// Weir Sluice in miniature). (6,0) is the sluice; (5,0) and (6,1) are deep water; the walk
// is (5,1), where a keeper stands. The ram starts at (4,0), beside the race at (5,0).
describe("pathing to a target with impassable neighbours (C4)", () => {
  const sluice: ObjectiveSetup = { id: "sluice", name: "Sluice", description: "", hex: { q: 6, r: 0 }, integrity: 100, defender: FB };
  const race = openBoard(7, 5, { "6,0": "river", "5,0": "river", "6,1": "river", "5,1": "road" });
  const batter: Action = { kind: "attack", target: { kind: "objective", side: "enemy" } };
  const kitFor = (ram = { q: 4, r: 0 }) =>
    actionContext(scenario({ board: race, objectives: [sluice], squads: [squad("ram", AH, ram), squad("keeper", FB, { q: 5, r: 1 })] }));

  it("an attacker beside deep water still closes on the only dry approach, then fights whoever holds it", () => {
    const kit = kitFor();
    executeAction(kit.ctx, kit.get("ram"), batter);
    // It moves up beside the keeper on the walk, not stalling at the water's edge.
    expect(kit.events[0]).toMatchObject({ kind: "move", squadId: "ram", from: { q: 4, r: 0 } });
    expect(hexDistance(kit.get("ram").hex, { q: 5, r: 1 })).toBe(1);
    executeAction(kit.ctx, kit.get("ram"), batter);
    expect(kit.events.at(-1)).toMatchObject({ kind: "engagement", attackerId: "ram", defenderId: "keeper" });
  });

  it("with the walk clear, walks up it and batters the objective", () => {
    const kit = actionContext(scenario({ board: race, objectives: [sluice], squads: [squad("ram", AH, { q: 4, r: 0 })] }));
    for (let beat = 0; beat < 3 && kit.state.objectives[0].integrity === 100; beat += 1) executeAction(kit.ctx, kit.get("ram"), batter);
    expect(kit.get("ram").hex).toEqual({ q: 5, r: 1 });
    expect(kit.state.objectives[0].integrity).toBeLessThan(100);
  });

  it("a target walled in by water keeps the old approach: the attacker closes as near as the ground allows", () => {
    const moat = openBoard(7, 5, { "5,0": "river", "6,1": "river", "5,1": "river", "6,0": "river" });
    const kit = actionContext(scenario({ board: moat, objectives: [sluice], squads: [squad("ram", AH, { q: 2, r: 2 })] }));
    executeAction(kit.ctx, kit.get("ram"), batter);
    expect(kit.events[0]).toMatchObject({ kind: "move", squadId: "ram" });
    expect(kit.get("ram").hex).not.toEqual({ q: 2, r: 2 });
  });
});
