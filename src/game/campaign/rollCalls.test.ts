// The Roll's named calls (rollCalls.ts): harness invariants the balance gate relies on.
import { describe, expect, it } from "vitest";
import { scenarios as introScenarios } from "../engine/scenarios";
import { cinderRoad1 } from "../engine/scenarios/cinderRoad1";
import { registry } from "../packs/registry";
import { startCampaign } from "./campaign";
import { cinderRoad } from "./cinderRoad";
import { ashAndBanner } from "./definition";
import { recommendedForce } from "./roll";
import { pickForce, greedyScore, templatePlan } from "./rollCalls";
import { balanceVariantsIn, introCarrySource } from "./rosters";

const campaigns = registry.packs.flatMap((pack) => pack.campaigns);
const scenarios = registry.scenarios();
const carryFrom = () => introCarrySource(ashAndBanner, introScenarios, "first_call");

describe("reference plans on the named calls (P7 finding 1)", () => {
  it("every reference plan is played exactly as authored, on every call of every battle", () => {
    for (const scenario of scenarios) {
      for (const variant of balanceVariantsIn(campaigns, scenarios, scenario, carryFrom)) {
        const name = `${scenario.id} [${variant.name ?? variant.kind}]`;
        expect(variant.scenario.referencePlans, name).toEqual(scenario.referencePlans);
      }
    }
  });

  it("Cinder Road's bad plan is the pure march on every call (no banner slipped onto the bows' post)", () => {
    for (const variant of balanceVariantsIn(campaigns, scenarios, cinderRoad1, carryFrom)) {
      expect(new Set(Object.values(variant.scenario.referencePlans!.bad)), variant.name).toEqual(new Set(["bring_the_water"]));
    }
  });

  it("the role template only fills a flex post the plan leaves unset", () => {
    const start = startCampaign(cinderRoad);
    const frontlineBows = pickForce(cinderRoad, start, cinderRoad1, greedyScore, { outriders: "cavalry", bows: "frontline" })!;
    const { bows: _unset, ...partial } = cinderRoad1.referencePlans!.bad;
    // Set: kept, whoever fills the post.
    expect(templatePlan(cinderRoad1.referencePlans!.bad, cinderRoad, start, cinderRoad1, frontlineBows).bows).toBe("bring_the_water");
    // Unset: the call's template for the role that fills it.
    expect(templatePlan(partial, cinderRoad, start, cinderRoad1, frontlineBows).bows).toBe("rescue_standard");
    // A single-role post the plan leaves unset stays unset (the squad keeps its scenario doctrine).
    const { van_west: _west, ...noWest } = cinderRoad1.referencePlans!.bad;
    expect(templatePlan(noWest, cinderRoad, start, cinderRoad1, recommendedForce(cinderRoad, start, cinderRoad1))).not.toHaveProperty("van_west");
  });
});
