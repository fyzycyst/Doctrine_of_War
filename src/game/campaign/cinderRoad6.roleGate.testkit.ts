// Cinder Road battle 5's (the finale's) role gate, one describe per named call: each
// cinderRoad6.roles.<call>.sim.test.ts calls describeRoleGate("<call>"). They run under
// `npm run test:finale` (src/test/suites.ts): a 19-squad, 14-phase battle costs about four C2
// games, so the per-call files sample seeds (documented below) and the full per-plan census on
// the sign-off range is on the battle sheet. Rule: docs/CAMPAIGN.md, "roles are defined by what
// they achieve".
import { describe, expect, it } from "vitest";
import { GATE_SEEDS, GUARDRAILS, SMOKE_STANDARD_ERRORS } from "../engine/balance";
import { BANNER, BREACH, calls, PARTIAL_RUSHES, rates, RIDER_HOLD } from "./cinderRoad6.roles.testkit";
import { unfilledCombos, type NamedPlan } from "./roles.testkit";

/** Gate seeds per banner-unfilled combo and policy (25 combos x 3 policies a call). */
export const BANNER_SEEDS = 16;
/** Gate seeds per uniform breach-unfilled plan and policy (the static check covers every combination). */
export const BREACH_SEEDS = 4;
/**
 * Gate seeds per banner-unfilled combo and partial rush (25 combos x 15 rushes a call): a
 * regression screen; the proof is the sign-off census (500 seeds each; every post but two is
 * screened on tuning seeds and the rows at 50% or more are promoted to 500).
 */
export const PARTIAL_RUSH_SEEDS = 8;
/**
 * The screen is two-stage. A combo with at least this many wins of the first 8 seeds is played
 * again on the next PARTIAL_RUSH_RECHECK_SEEDS and fails only if it reaches the floor there. At
 * 8 seeds a plan that truly wins 55% shows 6 of 8 a quarter of the time, and the combos of one
 * rush share their seeds, so a lucky cluster lifts them all together (the first 8 gate seeds win
 * 8/8 for one rush that is 37-55% on 200).
 */
export const PARTIAL_RUSH_ESCALATE_AT = 6;
export const PARTIAL_RUSH_RECHECK_SEEDS = 40;
/** Gate seeds for the CR6 warden's named partial rush (the bare assault, the breach posts only). */
export const WARDEN_RUSH_SEEDS = 40;
/**
 * The warden's timed rider hold (RIDER_HOLD) is a smoke check, not a gate: it runs about 70%
 * on the famous calls (carried recommended 1079/1500 pooled, Wilson 69.6-74.2), so 40 gate
 * seeds land exactly on 30/40 and any floor-level threshold would flap. It is judged like the
 * guardrails' smoke, the floor plus SMOKE_STANDARD_ERRORS standard errors at its seeds (60:
 * ~86.2%); the sign-off census is the proof.
 */
export const RIDER_HOLD_SEEDS = 60;
const RIDER_HOLD_MAX = GUARDRAILS.intendedMin + SMOKE_STANDARD_ERRORS * Math.sqrt((GUARDRAILS.intendedMin * (1 - GUARDRAILS.intendedMin)) / RIDER_HOLD_SEEDS);

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
 * - Banner unfilled, partially rushed (the CR6 warden): the same 25 under each of the gate's 15
 *   partial rushes (PARTIAL_RUSHES: the breach posts only, the vans only, every post but one, and
 *   the four worst every-post-but-two), a
 *   two-stage screen (8 seeds; 40 more for any combo with 6 or more wins, which must stay below
 *   the floor; the sign-off census at 500 seeds is the proof); and the
 *   warden's own partial rush (the bare assault, the breach posts only) at 40 seeds, below the floor.
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

    it("banner unfilled, partially rushed (the breach posts only, the vans only, every post but one or the worst two): a two-stage screen, below the floor", () => {
      const failures: string[] = [];
      for (const rush of PARTIAL_RUSHES) {
        for (const { name, orders } of unfilledCombos(scenario, plans.intended, BANNER)) {
          const result = rates(scenario, orders, rush, PARTIAL_RUSH_SEEDS);
          if (result.bannered > 0) failures.push(`${name} (${rush.name}) rallied the march in ${result.bannered}/${PARTIAL_RUSH_SEEDS}: not an unfilled plan`);
          if (Math.round(result.advance * PARTIAL_RUSH_SEEDS) < PARTIAL_RUSH_ESCALATE_AT) continue;
          const recheck = rates(scenario, orders, rush, PARTIAL_RUSH_RECHECK_SEEDS, GATE_SEEDS.first + PARTIAL_RUSH_SEEDS);
          if (recheck.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${rush.name}) advances ${recheck.advance} on the recheck (${PARTIAL_RUSH_RECHECK_SEEDS} seeds)`);
          if (recheck.bannered > 0) failures.push(`${name} (${rush.name}) rallied the march on the recheck: not an unfilled plan`);
        }
      }
      if (call.policy === "diagnostic") {
        if (failures.length > 0) console.info(`[diagnostic: ${callName}, partial rushes] ${failures.join("; ")}`);
        return;
      }
      expect(failures).toEqual([]);
    });

    it("the CR6 warden's partial rush (the bare assault, only the breach posts rushing): below the floor", () => {
      const result = rates(scenario, plans.bad, PARTIAL_RUSHES[0], WARDEN_RUSH_SEEDS);
      expect(result.bannered).toBe(0);
      if (call.policy === "diagnostic") {
        console.info(`[diagnostic: ${callName}, the warden's partial rush] advances ${result.advance}`);
        return;
      }
      expect(result.advance).toBeLessThan(GUARDRAILS.intendedMin);
    });

    it("the CR6 warden's timed rider hold (standard on Shield the Line, bows on Clean Counterstroke): a smoke check", () => {
      const orders = { ...plans.bad, standard: "shield_the_line", bows: "clean_counterstroke" };
      const result = rates(scenario, orders, RIDER_HOLD, RIDER_HOLD_SEEDS);
      expect(result.bannered).toBe(0);
      if (call.policy === "diagnostic") {
        console.info(`[diagnostic: ${callName}, the timed rider hold] advances ${result.advance}`);
        return;
      }
      expect(result.advance).toBeLessThan(RIDER_HOLD_MAX);
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
      // The second banner's post alone: the standard marches (as in the bare assault). The
      // standard alone is the tracked alternative.
      const secondOnly = { ...plans.intended, standard: plans.bad.standard };
      for (const [name, orders] of [["two banners", plans.intended], ["one banner, the standard", plans.alternative!], ["one banner, the second banner's post", secondOnly]] as const) {
        const result = rates(scenario, orders, "none", BANNER_SEEDS);
        // A banner rallies the march on its approach in (nearly) every game.
        expect(result.bannered, name).toBeGreaterThanOrEqual(BANNER_SEEDS * 0.9);
        expect(result.breached, name).toBeGreaterThan(0);
      }
    });
  });
}
