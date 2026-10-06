// The pursuit's role gate, one describe per named call: each cinderRoad5.roles.<call>.sim.test.ts
// calls describeRoleGate("<call>") (vitest spreads the calls across workers). Rule:
// docs/CAMPAIGN.md, "pursuit battles".
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import type { MusterPolicy } from "../engine/muster";
import { calls, HUNT, rates, SEEDS, unfilledSlack } from "./cinderRoad5.roles.testkit";
import { nonFillers, unfilledCombos } from "./roles.testkit";

const POLICIES: readonly MusterPolicy[] = ["none", "heuristic", "rush"];

/**
 * The role gate for one named call, a full per-plan census: every combination of the stock
 * doctrines that do not fill the hunt over its three posts (4^3 = 64), each on SEEDS gate seeds
 * and judged on its own, never pooled, under no muster, the heuristic and the rush. Each stays
 * below the floor and wins in at most unfilledSlack of its games (every win breaks three
 * fleeing companies, so a win is a hunt by accident). Every non-filler mono stays below the
 * floor too; the fillers' monos are pursuits done right (the pursuit exception).
 */
export function describeRoleGate(callName: string) {
  const call = calls.find((item) => item.name === callName);
  if (!call) throw new Error(`No call "${callName}" for the pursuit's role gate`);
  const scenario = call.scenario;
  const plans = scenario.referencePlans!;
  describe(`Cut the Retreat [${callName}]: no plan that leaves the hunt unfilled reaches the floor`, () => {
    for (const muster of POLICIES) {
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

    it("every non-hunting mono stays below the floor (the pursuit exception spares only the hunt's fillers)", () => {
      const failures: string[] = [];
      for (const doctrineId of nonFillers(scenario, HUNT)) {
        const mono = Object.fromEntries(Object.keys(plans.intended).map((id) => [id, doctrineId]));
        for (const muster of POLICIES) {
          const result = rates(scenario, mono, muster);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`all ${doctrineId} (${muster}) advances ${result.advance}`);
        }
      }
      expect(failures).toEqual([]);
    });
  });
}
