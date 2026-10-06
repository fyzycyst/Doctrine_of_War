// Cinder Road battle 6's role gate, one describe per named call: each
// cinderRoad6.roles.<call>.sim.test.ts calls describeRoleGate("<call>"). They run under
// `npm run test:finale` (src/test/suites.ts): a 19-squad, 9-phase battle costs about four C2
// games, so the per-call files sample seeds (documented below) and the full per-plan census on
// the sign-off range is on the battle sheet. Rule: docs/CAMPAIGN.md, "roles are defined by what
// they achieve".
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import { BANNER, BREACH, calls, rates } from "./cinderRoad6.roles.testkit";
import { unfilledCombos, type NamedPlan } from "./roles.testkit";

/** Gate seeds per banner-unfilled combo and policy (25 combos x 3 policies a call). */
export const BANNER_SEEDS = 16;
/** Gate seeds per uniform breach-unfilled plan and policy (the static check covers every combination). */
export const BREACH_SEEDS = 4;

const POLICIES = ["none", "heuristic", "rush"] as const;

/**
 * The role gate for one named call: every plan that leaves a role unfilled stays below the floor
 * with no muster, the heuristic muster and the rush, judged per plan; the observables confirm
 * the role was unfilled; the accepted fillers fill it.
 * - Banner unfilled: the cartesian product of the battle's stock non-banner doctrines over the
 *   two banner posts (25), and the pure march under rush the march too. Only Rescue Standard
 *   rallies, so none of these can fill the role by accident: the observable must read zero.
 * - Breach unfilled: each uniform non-march doctrine over the march's posts (the product is
 *   5^7; no stock doctrine but Bring the Water strikes the gate, the static check in
 *   cinderRoad6.test.ts, so none can win).
 * A diagnostic call (weakest legal, the roster where the lesson is weakest) is reported, not
 * failed, as it is in the guardrails: its recovery force (rough) is gated instead.
 */
export function describeRoleGate(callName: string) {
  const call = calls.find((item) => item.name === callName);
  if (!call) throw new Error(`No call "${callName}" for the finale's role gate`);
  const scenario = call.scenario;
  const plans = scenario.referencePlans!;
  describe(`Break the Strongpoint [${callName}]: no plan that leaves a role unfilled reaches the floor`, () => {
    it("banner unfilled (every stock non-banner doctrine on both banner posts, and the pure march): no muster, heuristic, rush", () => {
      const unbannered: NamedPlan[] = unfilledCombos(scenario, plans.intended, BANNER);
      const failures: string[] = [];
      for (const muster of POLICIES) {
        for (const { name, orders } of unbannered) {
          const result = rates(scenario, orders, muster, BANNER_SEEDS);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance} (bannered ${result.bannered}/${BANNER_SEEDS})`);
          if (result.bannered > 0) failures.push(`${name} (${muster}) rallied the march in ${result.bannered}/${BANNER_SEEDS}: not an unfilled plan`);
        }
      }
      const pure = rates(scenario, plans.bad, "rush the march", BANNER_SEEDS);
      if (pure.advance >= GUARDRAILS.intendedMin) failures.push(`the pure march (rush the march) advances ${pure.advance}`);
      if (call.policy === "diagnostic") {
        if (failures.length > 0) console.info(`[diagnostic: ${callName}] ${failures.join("; ")}`);
        return;
      }
      expect(failures).toEqual([]);
    });

    it("breach unfilled (each stock non-march doctrine on every march post): no muster, heuristic, rush; nobody strikes the gate", () => {
      const uniform = unfilledCombos(scenario, plans.intended, BREACH).filter(({ orders }) => new Set(BREACH.posts.map((post) => orders[post])).size === 1);
      const failures: string[] = [];
      for (const muster of POLICIES) {
        for (const { name, orders } of uniform) {
          const result = rates(scenario, orders, muster, BREACH_SEEDS);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance}`);
          if (result.breached > 0) failures.push(`${name} (${muster}) struck the gate in ${result.breached}/${BREACH_SEEDS}: not an unfilled plan`);
        }
      }
      expect(failures).toEqual([]);
    });

    it("the accepted fillers fill the banner role: two banners (intended), one on either banner post", () => {
      // The standard alone: the second banner's post marches (as in the bare assault).
      const standardOnly = { ...plans.intended, bows: plans.bad.bows };
      for (const [name, orders] of [["two banners", plans.intended], ["one banner, the second banner's post", plans.alternative!], ["one banner, the standard", standardOnly]] as const) {
        const result = rates(scenario, orders, "none", BANNER_SEEDS);
        // A banner rallies the march on its approach in (nearly) every game.
        expect(result.bannered, name).toBeGreaterThanOrEqual(BANNER_SEEDS * 0.9);
        expect(result.breached, name).toBeGreaterThan(0);
      }
    });
  });
}
