// The harrying battle's role gate, one describe per named call: each cinderRoad5.roles.<call>.sim.test.ts
// calls describeRoleGate("<call>") (vitest spreads the calls across workers); they run under
// `npm run test:campaign` (src/test/suites.ts). Rule: docs/CAMPAIGN.md, "harrying battles".
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import { calls, HUNT, HARRYING_MUSTERS, rates, SEEDS, unfilledSlack } from "./cinderRoad5.roles.testkit";
import { nonFillers, unfilledCombos } from "./roles.testkit";

/**
 * The role gate for one named call, a full per-plan census: every combination of the stock
 * doctrines that do not fill the hunt over its three posts (4^3 = 64), each on SEEDS gate seeds
 * and judged on its own, never pooled, under no muster, the heuristic and "close" (the
 * interception adversary, which replaces the rush: the rush has nothing to rush toward here).
 * Each stays below the floor and wins in at most unfilledSlack of its games (every win breaks
 * three fleeing companies, so a win is a hunt by accident). Every non-filler mono stays below the
 * floor too; the fillers' monos are harrying done right (the harrying exception). The CR5
 * warden's counterexample (everyone on Shield the Line, mustered beside the road) is a named
 * regression on every call.
 */
export function describeRoleGate(callName: string) {
  const call = calls.find((item) => item.name === callName);
  if (!call) throw new Error(`No call "${callName}" for the harrying battle's role gate`);
  const scenario = call.scenario;
  const plans = scenario.referencePlans!;
  describe(`Turn the Retreat [${callName}]: no plan that leaves the hunt unfilled reaches the floor`, () => {
    for (const muster of HARRYING_MUSTERS) {
      it(`hunt unfilled (all ${nonFillers(scenario, HUNT).length ** HUNT.posts.length} stock non-hunting combinations on the hunt's posts, ${muster}): judged per plan`, () => {
        const failures: string[] = [];
        for (const { name, orders } of unfilledCombos(scenario, plans.intended, HUNT)) {
          const result = rates(scenario, orders, muster);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance}`);
          if (result.wins > SEEDS * unfilledSlack(muster)) failures.push(`${name} (${muster}) wins ${result.wins}/${SEEDS} (broke ${result.broken.toFixed(1)} a game): not a hunt-unfilled plan`);
        }
        expect(failures).toEqual([]);
      });
    }

    it("every non-hunting mono stays below the floor (the harrying exception spares only the hunt's fillers)", () => {
      const failures: string[] = [];
      for (const doctrineId of nonFillers(scenario, HUNT)) {
        const mono = Object.fromEntries(Object.keys(plans.intended).map((id) => [id, doctrineId]));
        for (const muster of HARRYING_MUSTERS) {
          const result = rates(scenario, mono, muster);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`all ${doctrineId} (${muster}) advances ${result.advance}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it("the CR5 warden's counterexample stays a loss: everyone on Shield the Line, mustered beside the road in phase 1", () => {
      const shield = Object.fromEntries(Object.keys(plans.intended).map((id) => [id, "shield_the_line"]));
      const result = rates(scenario, shield, "warden");
      expect(result.advance).toBeLessThan(GUARDRAILS.intendedMin);
      expect(result.wins).toBeLessThanOrEqual(SEEDS * unfilledSlack("warden"));
    });
  });
}
