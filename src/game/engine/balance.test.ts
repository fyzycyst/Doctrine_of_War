import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { balancePlans, GATE_SEEDS, guardrailFailures, isGateSeed, playBattle, runBalance, smokeGuardrails, TUNING_SEEDS, type BalanceRow } from "./balance";
import { doctrineLibrary } from "./doctrines";
import { prototypeScenarios } from "./fixtures";
import { GUARDRAIL_SCENARIO_IDS } from "./guardrails.testkit";
import { lintScenario } from "../packs/lint";
import { registry } from "../packs/registry";
import { scenarios } from "./scenarios";

describe("balance guardrails (small-N version of npm run balance)", () => {
  // The per-battle guardrail suites live in balance.<battle>.test.ts (see guardrails.testkit.ts).
  it("every battle has its own guardrail test file", () => {
    const files = Object.keys(import.meta.glob("./balance.*.test.ts"));
    const covered = files.map((file) => readFileSync(new URL(file, import.meta.url), "utf8").match(/describeGuardrails\("([^"]+)"\)/)?.[1]);
    expect([...covered].sort()).toEqual([...GUARDRAIL_SCENARIO_IDS].sort());
  });

  it("builds intended, bad and one mono plan per player doctrine", () => {
    const plans = balancePlans(scenarios[0]);
    expect(plans.map((plan) => plan.kind)).toEqual(["intended", "bad", "mono", "mono", "mono", "mono", "mono"]);
  });

  it("gates on held-out seeds: the gate range by default, disjoint from tuning, and never past its size", () => {
    expect(GATE_SEEDS.first).toBeGreaterThan(TUNING_SEEDS.first + TUNING_SEEDS.size - 1);
    const spy = scenarios[0];
    const plan = spy.referencePlans!.intended;
    // The default range is the gate range: runBalance(…, 12) plays exactly 100001..100012.
    const wins = (first: number) =>
      Array.from({ length: 12 }, (_, index) => playBattle(spy, plan, first + index, "on", "none")).filter((final) => final.status === "victory").length;
    expect(runBalance(spy, 12, "on", "none", ["intended"])[0].wins).toBe(wins(GATE_SEEDS.first));
    expect(runBalance(spy, 12, "on", "none", ["intended"], TUNING_SEEDS.first)[0].wins).toBe(wins(TUNING_SEEDS.first));
    expect(isGateSeed(GATE_SEEDS.first) && isGateSeed(GATE_SEEDS.first + GATE_SEEDS.size - 1)).toBe(true);
    expect(isGateSeed(GATE_SEEDS.first + GATE_SEEDS.size) || isGateSeed(TUNING_SEEDS.first + TUNING_SEEDS.size - 1)).toBe(false);
    expect(() => runBalance(spy, GATE_SEEDS.size + 1)).toThrow(/gate range holds/);
    expect(() => runBalance(spy, 1, "on", "none", ["intended"], 0)).toThrow(/First seed/);
  });

  it("the smoke suite's tolerance is two binomial standard errors at its seed count, never hand-picked", () => {
    const smoke = smokeGuardrails(60);
    expect(smoke.intendedMin).toBeCloseTo(0.75 - 2 * Math.sqrt((0.75 * 0.25) / 60), 10);
    expect(smoke.intendedMin).toBeCloseTo(0.638, 3);
    expect(smoke.badMax).toBeCloseTo(0.473, 3);
    expect(smoke.monoMax).toBeCloseTo(0.726, 3);
    // More seeds, tighter: the 500-seed gate itself is judged at GUARDRAILS exactly.
    expect(smokeGuardrails(500).intendedMin).toBeGreaterThan(smoke.intendedMin);
    const row = (kind: BalanceRow["kind"], winRate: number): BalanceRow => ({
      name: kind, kind, orders: {}, games: 60, wins: winRate * 60, winRate, stalemates: 0, stalemateRate: 0, meanObjective: null,
    });
    // 42/60 = 70%: under the 75% gate, inside the smoke tolerance.
    expect(guardrailFailures([row("intended", 0.7), row("bad", 0)], "floor")).toHaveLength(1);
    expect(guardrailFailures([row("intended", 0.7), row("bad", 0)], "floor", smoke)).toEqual([]);
    expect(guardrailFailures([row("intended", 0.6), row("bad", 0)], "floor", smoke)).toHaveLength(1);
  });

  it("no curated seed is a gate seed (pack lint enforces it)", () => {
    for (const scenario of [...registry.scenarios(), ...prototypeScenarios]) {
      if (scenario.curatedSeed !== undefined) expect(isGateSeed(scenario.curatedSeed), scenario.id).toBe(false);
    }
    const leaked = { ...registry.scenarios()[0], curatedSeed: GATE_SEEDS.first + 7 };
    expect(lintScenario(leaked, doctrineLibrary).join()).toMatch(/held-out balance gate range/);
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
