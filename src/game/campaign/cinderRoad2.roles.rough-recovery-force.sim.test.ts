// Cinder Road battle 2's role gate on the "rough (recovery force)" call (cinderRoad2.roleGate.testkit.ts).
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import { describeRoleGate } from "./cinderRoad2.roleGate.testkit";
import { calls, rates, SEEDS } from "./cinderRoad2.roles.testkit";

describeRoleGate("rough (recovery force)");

// Named regression (C2 + C5 warden): the closest unfilled combination to the classification
// limit. Keepers on Shield the Line left at their post, the standard on Bring the Water (the
// sixth marcher, which can meet the ram by the walk), heuristic muster, on the rough call.
// signoff3, 500 seeds: advances 33/500, guarded 60/500, won while guarded 25/500 (5.0%,
// Wilson 95% 3.4-7.3%). The advance floor is a hard gate here; guarded and wonGuarded on 40
// seeds are a diagnostic (printed), not a gate.
describe("Strike the Wagon Park [rough (recovery force)]: named regression, Shield keepers + the standard on Bring the Water", () => {
  it("stays below the floor with heuristic muster; reports guarded and won-while-guarded", () => {
    const call = calls.find((item) => item.name === "rough (recovery force)")!;
    const plans = call.scenario.referencePlans!;
    const result = rates(call.scenario, { ...plans.intended, keepers: "shield_the_line", standard: "bring_the_water" }, "heuristic");
    console.info(
      `[diagnostic] rough, Shield keepers + standard on Bring the Water, heuristic: advance ${result.advance * SEEDS}/${SEEDS}, guarded ${result.guarded}/${SEEDS}, won while guarded ${result.wonGuarded}/${SEEDS}`,
    );
    expect(result.advance).toBeLessThan(GUARDRAILS.intendedMin);
  }, 60_000);
});
