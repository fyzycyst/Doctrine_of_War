// Cinder Road battle 2's role gate, one describe per named call: each
// cinderRoad2.roles.<call>.sim.test.ts calls describeRoleGate("<call>") (about 10 s each, so
// vitest spreads the calls across workers). Rule: docs/CAMPAIGN.md, "roles are defined by
// what they achieve".
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import { calls, GUARD, MARCH, rates, SEEDS, unfilledSlack } from "./cinderRoad2.roles.testkit";
import { spread, unfilledCombos, type NamedPlan } from "./roles.testkit";

/** March-unfilled combos sampled per call (of 5^4 = 625; all of them are covered by the static check). */
export const MARCH_SAMPLE = 25;
/** Gate seeds per sampled march combo and policy (they cannot strike the park, so a few suffice). */
export const MARCH_SEEDS = 4;

const UNFILLED_POLICIES = ["none", "heuristic", "rush", "rush the march"] as const;

/**
 * The role gate for one named call (docs/CAMPAIGN.md): every plan that leaves a role unfilled
 * stays below the floor with no muster, the heuristic muster and the rush, and the role's
 * observable confirms the role really was left unfilled; the accepted guards do guard.
 * - Guard unfilled: the cartesian product of the battle's stock non-guard doctrines over the
 *   guard's posts (unfilledCombos), and the pure march; 40 gate seeds each.
 * - March unfilled: a spread sample of the product over the march's posts, plus each uniform
 *   one; MARCH_SEEDS each. No stock doctrine but Bring the Water can strike the park
 *   (cinderRoad2.test.ts), so every combo is covered by that static check.
 */
export function describeRoleGate(callName: string) {
  const call = calls.find((item) => item.name === callName);
  if (!call) throw new Error(`No call "${callName}" for battle 2's role gate`);
  const scenario = call.scenario;
  const plans = scenario.referencePlans!;
  describe(`Strike the Wagon Park [${callName}]: no plan that leaves a role unfilled reaches the floor`, () => {
    it("guard unfilled (every stock non-guard on the keepers' post, and the pure march): no muster, heuristic, rush, rush the march", () => {
      const unguarded: NamedPlan[] = [...unfilledCombos(scenario, plans.intended, GUARD), { name: "the pure march", orders: plans.bad }];
      const failures: string[] = [];
      for (const muster of UNFILLED_POLICIES) {
        for (const { name, orders } of unguarded) {
          const result = rates(scenario, orders, muster);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance}`);
          if (result.guarded > SEEDS * unfilledSlack(muster)) failures.push(`${name} (${muster}) guarded in ${result.guarded}/${SEEDS}: not an unfilled plan`);
        }
      }
      expect(failures).toEqual([]);
    }, 60_000);

    it("march unfilled (a sample of every stock non-march doctrine over the march's posts): no muster, heuristic, rush; nobody strikes the park", () => {
      const combos = unfilledCombos(scenario, plans.intended, MARCH);
      const uniform = combos.filter(({ orders }) => new Set(MARCH.posts.map((post) => orders[post])).size === 1);
      const sample = [...new Map([...uniform, ...spread(combos, MARCH_SAMPLE)].map((plan) => [plan.name, plan])).values()];
      const failures: string[] = [];
      for (const muster of ["none", "heuristic", "rush"] as const) {
        for (const { name, orders } of sample) {
          const result = rates(scenario, orders, muster, MARCH_SEEDS);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance}`);
          if (result.marched > 0) failures.push(`${name} (${muster}) struck the park in ${result.marched}/${MARCH_SEEDS}: not an unfilled plan`);
        }
      }
      expect(failures).toEqual([]);
    }, 60_000);

    it("the accepted guards guard: Hold for Dawn by its orders, Shield the Line by two legal musters onto the walk", () => {
      expect(rates(scenario, plans.intended, "none").guarded).toBe(SEEDS);
      const mustered = rates(scenario, { ...plans.intended, keepers: "shield_the_line" }, "onto the walk");
      expect(mustered.invalid).toEqual([]);
      expect(mustered.guarded).toBe(SEEDS);
    }, 60_000);
  });
}

