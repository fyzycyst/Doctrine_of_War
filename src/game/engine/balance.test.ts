import { describe, expect, it } from "vitest";
import { balancePlans, formatTable, guardrailFailures, runBalance, type BalanceRow } from "./balance";
import { ashAndBanner } from "../campaign/definition";
import { balanceVariantsFor } from "../campaign/rosters";
import { scenarios } from "./scenarios";

describe("balance guardrails (small-N version of npm run balance)", () => {
  for (const scenario of scenarios) {
    // Campaign battles are checked on every reference roster (see docs/CAMPAIGN.md).
    for (const variant of balanceVariantsFor(ashAndBanner, scenarios, scenario)) {
      it(`${scenario.title} [${variant.kind} roster] meets its guardrails over 60 seeds with fortune on`, () => {
        const rows = runBalance(variant.scenario, 60, "on");
        expect(guardrailFailures(rows, variant.policy), formatTable(variant.scenario, rows)).toEqual([]);
      }, 60_000); // hundreds of simulated battles; the 5 s default times out under full-suite load
    }
  }

  it("builds intended, bad and one mono plan per player doctrine", () => {
    const plans = balancePlans(scenarios[0]);
    expect(plans.map((plan) => plan.kind)).toEqual(["intended", "bad", "mono", "mono", "mono", "mono", "mono"]);
  });

  it("fails closed: bad seed counts, missing reference plans, missing rows and NaN rates", () => {
    expect(() => runBalance(scenarios[0], 0)).toThrow(/positive integer/);
    expect(() => runBalance(scenarios[0], Number.NaN)).toThrow(/positive integer/);
    expect(() => balancePlans({ ...scenarios[0], referencePlans: undefined })).toThrow(/no referencePlans/);
    expect(guardrailFailures([])).toEqual(["no intended plan was played", "no bad plan was played"]);
    const nan: BalanceRow = { name: "intended", kind: "intended", orders: {}, games: 0, wins: 0, winRate: Number.NaN, stalemates: 0, stalemateRate: 0, meanObjective: null };
    expect(guardrailFailures([nan])).toContain("intended has no valid win rate (0/0)");
  });

  it("the floor policy only checks that the intended plan advances and the bad plan does not", () => {
    const row = (kind: BalanceRow["kind"], winRate: number, stalemateRate = 0): BalanceRow => ({
      name: kind, kind, orders: {}, games: 100, wins: winRate * 100, winRate, stalemates: stalemateRate * 100, stalemateRate, meanObjective: null,
    });
    expect(guardrailFailures([row("intended", 0.6, 0.2), row("bad", 0.2), row("mono", 0.9)], "floor")).toEqual([]);
    expect(guardrailFailures([row("intended", 0.6, 0.1), row("bad", 0.3, 0.1)], "floor")).toEqual([
      "intended plan advances 70% (< 75%)",
      "bad plan advances 40% (> 35%)",
    ]);
  });

  it("flags each kind of guardrail breach", () => {
    const row = (kind: BalanceRow["kind"], winRate: number): BalanceRow => ({
      name: kind,
      kind,
      orders: {},
      games: 100,
      wins: winRate * 100,
      winRate,
      stalemates: 0,
      stalemateRate: 0,
      meanObjective: null,
    });
    expect(guardrailFailures([row("intended", 0.74), row("bad", 0.36), row("mono", 0.6)])).toHaveLength(3);
    expect(guardrailFailures([row("intended", 0.75), row("bad", 0.35), row("mono", 0.59)])).toEqual([]);
    // Mono plans are judged on advancing: wins plus stalemates.
    const stalling: BalanceRow = { ...row("mono", 0.3), stalemates: 30, stalemateRate: 0.3 };
    expect(guardrailFailures([row("intended", 0.8), row("bad", 0.1), stalling])).toEqual(["mono advances 60% (>= 60%)"]);
  });
});
