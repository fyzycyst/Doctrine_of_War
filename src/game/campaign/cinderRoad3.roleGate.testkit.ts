// Cinder Road battle 3's role gate, one describe per named call: each
// cinderRoad3.roles.<call>.sim.test.ts calls describeRoleGate("<call>") (vitest spreads the
// calls across workers). Rule: docs/CAMPAIGN.md, "roles are defined by what they achieve".
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import { calls, GUARD, MARCH, OTR, rates, SEEDS, unfilledSlack } from "./cinderRoad3.roles.testkit";
import { nonFillers, unfilledCombos, type NamedPlan } from "./roles.testkit";

const GUARD_POLICIES = ["none", "heuristic", "rush", "rush the column"] as const;
const MARCH_POLICIES = ["none", "heuristic", "rush"] as const;
/**
 * The march gate's two stages: every combination screened on MARCH_SCREEN_SEEDS gate seeds,
 * then the dangerous ones re-run on SEEDS. Eight screen seeds: on the rough call the warden's
 * counterexample (ford_van Fighting Withdrawal, road_van Rescue Standard, the rest Clean
 * Counterstroke) reaches the roads in 15 of 40 gate seeds, never more than 7 in a row without.
 */
export const MARCH_SCREEN_SEEDS = 8;
export const MARCH_TOP = 10;

/**
 * The role gate for one named call (docs/CAMPAIGN.md): every plan that leaves a role unfilled
 * stays below the floor with no muster, the heuristic muster and the rush, and the role's
 * observable confirms the plan does not win by filling the role; the intended watch guards.
 * - Guard unfilled: the full cartesian product of the battle's stock non-guard doctrines over
 *   the watch's posts (unfilledCombos: Open the Road, Fighting Withdrawal and Rescue
 *   Standard, mixed orders included: 3^2), and the pure march; SEEDS gate seeds each, under
 *   every policy.
 * - March unfilled: the full product over the column's posts of the stock doctrines that do
 *   not fill the march (4^4 = 256: Fighting Withdrawal is a declared weak march filler), in
 *   two stages per policy (no muster, the heuristic, the rush). Stage 1 screens every
 *   combination on MARCH_SCREEN_SEEDS gate seeds. Stage 2 re-runs on SEEDS seeds every
 *   combination that won or put a company on the roads in the screen, and the MARCH_TOP most
 *   dangerous besides (by companies on the roads, then wins, then how close any company came:
 *   a signal even in a lost game), and judges each plan on its own: below the floor, and
 *   winning by reaching the roads in at most unfilledSlack of its games. (An escape battle is
 *   won only on the roads, so every win of a march-unfilled plan is a win by filling the march
 *   by accident.) The C3 warden's re-review found that a one-seed-per-plan aggregate could
 *   hide a plan winning 15.8%; with Fighting Withdrawal struck from the fillers, this gate
 *   fails on that plan (docs/CAMPAIGN.md, C3).
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
    });

    for (const muster of MARCH_POLICIES) {
      it(`march unfilled (all ${nonFillers(scenario, MARCH).length ** MARCH.posts.length} stock non-march combinations on the column's posts, ${muster}): screened, then the dangerous judged per plan`, () => {
        const screened = unfilledCombos(scenario, plans.intended, MARCH).map((plan) => ({ ...plan, screen: rates(scenario, plan.orders, muster, MARCH_SCREEN_SEEDS) }));
        screened.sort((a, b) => b.screen.marched - a.screen.marched || b.screen.advance - a.screen.advance || a.screen.closest - b.screen.closest);
        const judged = screened.filter((plan, index) => index < MARCH_TOP || plan.screen.marched > 0 || plan.screen.advance > 0);
        const failures: string[] = [];
        for (const { name, orders } of judged) {
          const result = rates(scenario, orders, muster);
          const wins = Math.round(result.advance * SEEDS);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance}`);
          if (wins > SEEDS * unfilledSlack(muster)) failures.push(`${name} (${muster}) wins ${wins}/${SEEDS} by reaching the roads (reached them in ${result.marched}/${SEEDS}): not a march-unfilled plan`);
        }
        expect(failures).toEqual([]);
      });
    }

    it("the accepted guards guard: the intended watch keeps the Mill Road; the lances mustered into the Tollhouse Shallows (one legal move) meet the outriders there", () => {
      // The weakest legal call is a diagnostic: its two weakest companies on the watch are the
      // Roll's selection lesson, and its recovery force is the recommended call (gated).
      if (call.policy !== "diagnostic") expect(rates(scenario, plans.intended, "none").breached).toBe(0);
      // The muster-dependent guard (declared after the C3 warden's re-review, with the
      // orchestrator's sign-off): every company on Open the Road, the lances mustered into the
      // shallows in phase 1. It fills the guard: it fights the outriders before they get through.
      const pureMarch = Object.fromEntries(Object.keys(plans.intended).map((id) => [id, OTR]));
      const mustered = rates(scenario, pureMarch, "into the shallows");
      expect(mustered.invalid).toEqual([]);
      expect(mustered.guarded).toBeGreaterThanOrEqual(SEEDS * 0.9);
    });
  });
}
