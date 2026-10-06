// The finale's role ablation and fog regression: many 19-squad battles, so they run under
// `npm run test:finale` (src/test/suites.ts), not `npm test`.
import { describe, expect, it } from "vitest";
import { decisionLeaks } from "../engine/fogDecisions.testkit";
import { createRng } from "../engine/rng";
import { cinderRoad6 } from "../engine/scenarios/cinderRoad6";
import type { Orders } from "../engine/types";
import { BTW, calls, rates } from "./cinderRoad6.roles.testkit";

/** Tuning seeds per plan for the ablation (the census on the sign-off range is on the battle sheet). */
const SEEDS = 40;
const recommended = calls.find((call) => call.name === "recommended")!.scenario;
const plans = recommended.referencePlans!;
const on = (orders: Orders, ids: string[], doctrineId: string): Orders => ({ ...orders, ...Object.fromEntries(ids.map((id) => [id, doctrineId])) });

describe("Break the Strongpoint: the roles (simulation)", () => {
  it("the banner earns its place: both banners on the best non-banner doctrine cost at least 15 points (no muster)", () => {
    const base = rates(recommended, plans.intended, "none", SEEDS, 1).advance;
    expect(base).toBeGreaterThanOrEqual(0.75);
    const best = Math.max(...["bring_the_water", "shield_the_line", "fighting_withdrawal", "clean_counterstroke", "hold_for_dawn"].map((id) => rates(recommended, on(plans.intended, ["standard", "bows"], id), "none", SEEDS, 1).advance));
    expect(base - best).toBeGreaterThanOrEqual(0.15);
  });

  it("the breach earns its place: the march on any other doctrine never wins", () => {
    const marchers = Object.keys(plans.intended).filter((id) => plans.intended[id] === BTW);
    for (const id of ["shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "hold_for_dawn"]) {
      expect(rates(recommended, on(plans.intended, marchers, id), "none", 10, 1).advance, id).toBe(0);
    }
  });

  it("fog: no Banner decision, route or withdrawal on this ground depends on an unseen enemy, at every step", () => {
    // P4's step-level check (fogDecisions.testkit.ts) on the finale's own plans: the intended
    // plan, the bare assault, and a mix that falls back and holds (the hunters stay unseen in the
    // flank works until phase 3).
    const mix = { ...cinderRoad6.referencePlans!.intended, north_van: "fighting_withdrawal", standard: "hold_for_dawn", bows: "clean_counterstroke", lances: "shield_the_line" };
    const seeds = Array.from({ length: 4 }, (_, index) => 101 + index);
    const pick = createRng(20261007);
    for (const [name, orders] of Object.entries({ intended: cinderRoad6.referencePlans!.intended, bare: cinderRoad6.referencePlans!.bad, mix })) {
      const { checked, leaks } = decisionLeaks(cinderRoad6, orders, seeds, () => pick.next());
      expect(checked, name).toBeGreaterThan(200);
      expect(leaks.slice(0, 3), name).toEqual([]);
    }
  });
});
