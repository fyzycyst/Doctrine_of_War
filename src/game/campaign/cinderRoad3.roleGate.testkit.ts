// Cinder Road battle 3's role gate, one describe per named call: each
// cinderRoad3.roles.<call>.sim.test.ts calls describeRoleGate("<call>") (vitest spreads the
// calls across workers). Rule: docs/CAMPAIGN.md, "roles are defined by what they achieve".
import { describe, expect, it } from "vitest";
import { GATE_SEEDS, GUARDRAILS } from "../engine/balance";
import { calls, GUARD, MARCH, OTR, rates, SEEDS, unfilledSlack } from "./cinderRoad3.roles.testkit";
import { unfilledCombos, type NamedPlan } from "./roles.testkit";

const GUARD_POLICIES = ["none", "heuristic", "rush", "rush the column"] as const;
const MARCH_POLICIES = ["none", "heuristic", "rush"] as const;

/**
 * The role gate for one named call (docs/CAMPAIGN.md): every plan that leaves a role unfilled
 * stays below the floor with no muster, the heuristic muster and the rush, and the role's
 * observable confirms the plan does not win by filling the role; the intended watch guards.
 * - Guard unfilled: the full cartesian product of the battle's stock non-guard doctrines over
 *   the watch's posts (unfilledCombos: Open the Road and Fighting Withdrawal, mixed orders
 *   included), and the pure march; SEEDS gate seeds each, under every policy.
 * - March unfilled: the full product over the column's posts (5^4 = 625), each played once on
 *   its own gate seed, under no muster, the heuristic and the rush: nobody reaches the
 *   far-bank roads, so no such plan can win (an escape battle is won only on the roads).
 */
export function describeRoleGate(callName: string) {
  const call = calls.find((item) => item.name === callName);
  if (!call) throw new Error(`No call "${callName}" for battle 3's role gate`);
  const scenario = call.scenario;
  const plans = scenario.referencePlans!;
  describe(`Open a Road [${callName}]: no plan that leaves a role unfilled reaches the floor`, () => {
    it("guard unfilled (every stock non-guard combination on the watch's posts, and the pure march): no muster, heuristic, rush, rush the column", () => {
      const pureMarch = Object.fromEntries(Object.keys(plans.intended).map((id) => [id, OTR]));
      const unguarded: NamedPlan[] = [...unfilledCombos(scenario, plans.intended, GUARD), { name: "the pure march", orders: pureMarch }];
      const failures: string[] = [];
      for (const muster of GUARD_POLICIES) {
        for (const { name, orders } of unguarded) {
          const result = rates(scenario, orders, muster);
          const counts = `guarded ${result.guarded}/${SEEDS}, won while guarded ${result.wonGuarded}/${SEEDS}`;
          // The floor (hard gate): an unfilled plan advances below intendedMin.
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance} (${counts})`);
          // Classification uses wonGuarded: wins through accidental guarding. The raw guarded
          // count (touching the role on an honest route, then losing) is reported, not judged.
          if (result.wonGuarded > SEEDS * unfilledSlack(muster)) failures.push(`${name} (${muster}) wins through accidental guarding (${counts}): not an unfilled plan`);
        }
      }
      expect(failures).toEqual([]);
    }, 30_000);

    for (const muster of MARCH_POLICIES) {
      it(`march unfilled (all ${5 ** MARCH.posts.length} stock non-march combinations on the column's posts, ${muster}): they do not win by reaching the roads`, () => {
        // Each combination once, on its own gate seed: an escape battle is won only on the
        // roads, so a combination near the floor would win most of its games. A company can
        // reach a road head on its honest route (Counterstroke cuts one down, Fighting
        // Withdrawal walks onto it) and still lose: that is reported, not judged; winning by
        // it is judged, within unfilledSlack.
        const combos = unfilledCombos(scenario, plans.intended, MARCH);
        let touched = 0;
        const won: string[] = [];
        combos.forEach(({ name, orders }, index) => {
          const result = rates(scenario, orders, muster, 1, GATE_SEEDS.first + index);
          touched += result.marched;
          if (result.advance > 0) won.push(`${name} (seed ${GATE_SEEDS.first + index})`);
        });
        expect(won.length, `${won.length} of ${combos.length} won (reached the roads in ${touched}): ${won.join("; ")}`).toBeLessThanOrEqual(Math.floor(combos.length * unfilledSlack(muster)));
      }, 30_000);
    }

    it("the intended watch keeps the Mill Road: no Host company gets through (gated calls)", () => {
      // The weakest legal call is a diagnostic: its two weakest companies on the watch are the
      // Roll's selection lesson, and its recovery force is the recommended call (gated).
      if (call.policy === "diagnostic") return;
      expect(rates(scenario, plans.intended, "none").breached).toBe(0);
    }, 30_000);
  });
}
