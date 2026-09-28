import { describe, expect, it } from "vitest";
import { balancePlans, formatTable, guardrailFailures, runBalance, type BalanceRow } from "./balance";
import { scenarios } from "./scenarios";

describe("balance guardrails (small-N version of npm run balance)", () => {
  for (const scenario of scenarios) {
    it(`${scenario.title} meets the guardrails over 60 seeds with fortune on`, () => {
      const rows = runBalance(scenario, 60, "on");
      expect(guardrailFailures(rows), formatTable(scenario, rows)).toEqual([]);
    });
  }

  it("builds intended, bad and one mono plan per player doctrine", () => {
    const plans = balancePlans(scenarios[0]);
    expect(plans.map((plan) => plan.kind)).toEqual(["intended", "bad", "mono", "mono", "mono", "mono", "mono"]);
  });

  it("flags each kind of guardrail breach", () => {
    const row = (kind: BalanceRow["kind"], winRate: number): BalanceRow => ({
      name: kind,
      kind,
      orders: {},
      games: 100,
      wins: winRate * 100,
      winRate,
      meanObjective: null,
    });
    expect(guardrailFailures([row("intended", 0.74), row("bad", 0.36), row("mono", 0.6)])).toHaveLength(3);
    expect(guardrailFailures([row("intended", 0.75), row("bad", 0.35), row("mono", 0.59)])).toEqual([]);
  });
});
