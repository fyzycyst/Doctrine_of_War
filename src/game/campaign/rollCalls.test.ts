// The Roll's named calls (rollCalls.ts): harness invariants the balance gate relies on.
import { describe, expect, it } from "vitest";
import { scenarios as introScenarios } from "../engine/scenarios";
import { cinderRoad1 } from "../engine/scenarios/cinderRoad1";
import { registry } from "../packs/registry";
import { startCampaign } from "./campaign";
import { cinderRoad } from "./cinderRoad";
import { ashAndBanner } from "./definition";
import { recommendedForce } from "./roll";
import { balancePlans, guardrailFailures, type BalanceRow } from "../engine/balance";
import { MissingCallError, pickForce, greedyScore, rollCallMatrix, rollDiagnostics, templatePlan } from "./rollCalls";
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

describe("the call census (P7 finding 3)", () => {
  it("Cinder Road battle 1 builds every documented call; only the illegal role pattern is not applicable, with its reason", () => {
    const matrix = rollCallMatrix(cinderRoad, scenarios, 0, carryFrom());
    expect(matrix.calls.map((item) => item.name)).toEqual([
      "recommended",
      "curated",
      "rough (recovery force)",
      "greedy",
      "weakest legal",
      "role: outriders=cavalry, bows=frontline",
      "role: outriders=frontline, bows=skirmish",
      "carried: recommended",
      "carried: greedy",
    ]);
    expect(matrix.notApplicable).toEqual([
      { name: "role: outriders=frontline, bows=frontline", reason: "not legal: it needs 5 frontline companies and the Roll has 4 ready" },
    ]);
  });

  it("fails closed when a mandatory call cannot be built (here: an authored call that is not legal)", () => {
    const broken = structuredClone(cinderRoad);
    broken.battles[0].slots.van_west = "sunward_lances"; // a cavalry company on a frontline post
    broken.battles[0].slots.outriders = "coldwater_shields";
    expect(() => rollCallMatrix(broken, scenarios, 0)).toThrow(MissingCallError);
    expect(() => rollCallMatrix(broken, scenarios, 0)).toThrow(/"curated" call cannot be built/);
  });
});

describe("the strongest-alternative diagnostic (P7 finding 4)", () => {
  const row = (kind: BalanceRow["kind"], winRate: number): BalanceRow => ({
    name: kind, kind, orders: {}, games: 100, wins: winRate * 100, winRate, stalemates: 0, stalemateRate: 0, meanObjective: null,
  });

  it("is a named plan on every Cinder Road call, played as authored, and never gated", () => {
    for (const variant of balanceVariantsIn(campaigns, scenarios, cinderRoad1, carryFrom)) {
      const plans = balancePlans(variant.scenario);
      expect(plans.filter((plan) => plan.kind === "alternative").map((plan) => plan.orders), variant.name).toEqual([cinderRoad1.referencePlans!.alternative]);
    }
    // An alternative that beats the intended plan is reported, not failed.
    expect(guardrailFailures([row("intended", 0.8), row("bad", 0.1), row("alternative", 0.95)])).toEqual([]);
  });

  it("reports the intended plan's smallest lead over it across the calls", () => {
    const d = rollDiagnostics([
      { name: "a", rows: [row("intended", 0.9), row("bad", 0), row("alternative", 0.7)] },
      { name: "b", rows: [row("intended", 0.85), row("bad", 0), row("alternative", 0.8)] },
    ]);
    expect(d.alternative?.name).toBe("b");
    expect(d.alternative?.lead).toBeCloseTo(0.05);
    expect(rollDiagnostics([{ name: "a", rows: [row("intended", 0.9), row("bad", 0)] }]).alternative).toBeNull();
  });
});
