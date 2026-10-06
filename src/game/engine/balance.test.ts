import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { balancePlans, GATE_SEEDS, runVariantProbe, guardrailFailures, isGateSeed, playBattle, PURSUIT_FILLERS, reservedRangeOf, runBalance, seedRange, SIGNOFF_BLOCKS, signoffRange, smokeGuardrails, TUNING_SEEDS, type BalanceRow } from "./balance";
import { doctrineLibrary } from "./doctrines";
import { prototypeScenarios } from "./fixtures";
import { GUARDRAIL_SCENARIO_IDS } from "./guardrails.testkit";
import { lintScenario } from "../packs/lint";
import { registry } from "../packs/registry";
import { scenarios } from "./scenarios";
import { variantProbes } from "./variantProbes";

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

  it("reserves sign-off blocks: the gate is block 1, signoff<k> is k*100000+1..+500, never overlapping tuning", () => {
    expect(seedRange("gate")).toEqual({ name: "gate", first: GATE_SEEDS.first, size: GATE_SEEDS.size });
    expect(seedRange("signoff1")).toEqual(seedRange("gate"));
    expect(seedRange("signoff2")).toEqual({ name: "signoff2", first: 200_001, size: 500 });
    expect(seedRange(`signoff${SIGNOFF_BLOCKS}`)?.first).toBe(SIGNOFF_BLOCKS * 100_000 + 1);
    expect(seedRange("tuning")).toEqual({ name: "tuning", ...TUNING_SEEDS });
    for (const bad of ["signoff0", "signoff10", "signoff", "held-out", ""]) expect(seedRange(bad), bad).toBeNull();
    expect(() => signoffRange(SIGNOFF_BLOCKS + 1)).toThrow(/Sign-off blocks/);
    expect(reservedRangeOf(200_001)?.name).toBe("signoff2");
    expect(reservedRangeOf(200_500)?.name).toBe("signoff2");
    expect(reservedRangeOf(200_501)).toBeNull();
    expect(reservedRangeOf(TUNING_SEEDS.first + TUNING_SEEDS.size - 1)).toBeNull();
    expect(reservedRangeOf(GATE_SEEDS.first)?.name).toBe("gate");
    // A sign-off block is played like the gate: paired seeds from its first, never past its size.
    const spy = scenarios[0];
    expect(runBalance(spy, 3, "on", "none", ["intended"], 200_001)[0].games).toBe(3);
    expect(() => runBalance(spy, 501, "on", "none", ["intended"], 200_001)).toThrow(/signoff2 range holds 500/);
  });

  it("no curated seed is a gate seed (pack lint enforces it)", () => {
    for (const scenario of [...registry.scenarios(), ...prototypeScenarios]) {
      if (scenario.curatedSeed !== undefined) expect(isGateSeed(scenario.curatedSeed), scenario.id).toBe(false);
    }
    const leaked = { ...registry.scenarios()[0], curatedSeed: GATE_SEEDS.first + 7 };
    expect(lintScenario(leaked, doctrineLibrary).join()).toMatch(/held-out balance gate range/);
    // ...nor in any reserved sign-off block.
    for (const scenario of [...registry.scenarios(), ...prototypeScenarios]) {
      if (scenario.curatedSeed !== undefined) expect(reservedRangeOf(scenario.curatedSeed), scenario.id).toBeNull();
    }
    const signoff = { ...registry.scenarios()[0], curatedSeed: 300_042 };
    expect(lintScenario(signoff, doctrineLibrary).join()).toMatch(/reserved sign-off range signoff3 \(300001\.\.300500\)/);
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

  it("the pursuit exception: a pursuit's filler monos skip the mono cap; every other mono is still capped", () => {
    const mono = (doctrineId: string, winRate: number): BalanceRow => ({
      name: `all ${doctrineId}`, kind: "mono", orders: { a: doctrineId, b: doctrineId }, games: 100, wins: winRate * 100, winRate, stalemates: 0, stalemateRate: 0, meanObjective: null,
    });
    const base = [{ ...mono("x", 0.9), name: "intended", kind: "intended" as const }, { ...mono("y", 0), name: "bad", kind: "bad" as const }];
    const exempt = PURSUIT_FILLERS.cinder_road_gate_road;
    expect(exempt).toEqual(["clean_counterstroke", "bring_the_water", "open_the_road"]);
    expect(guardrailFailures([...base, mono("clean_counterstroke", 1)], "full", undefined, exempt)).toEqual([]);
    expect(guardrailFailures([...base, mono("shield_the_line", 0.6)], "full", undefined, exempt)).toEqual(["all shield_the_line advances 60% (>= 60%)"]);
    // Without the exception (every other battle), the same filler mono is capped.
    expect(guardrailFailures([...base, mono("clean_counterstroke", 1)])).toEqual(["all clean_counterstroke advances 100% (>= 60%)"]);
    // Only pursuits are listed.
    expect(Object.keys(PURSUIT_FILLERS)).toEqual(["cinder_road_gate_road"]);
  });

  it("plays editor-variant probes as diagnostic rows, never gated, and fails closed on a variant the editor would refuse", () => {
    for (const [scenarioId, probes] of Object.entries(variantProbes)) {
      const scenario = registry.scenario(scenarioId);
      expect(scenario, scenarioId).toBeDefined();
      for (const probe of probes) {
        const players = scenario!.squads.filter((squad) => squad.faction === scenario!.playerFaction && !squad.noncombatant).map((squad) => squad.id);
        expect(Object.keys(probe.orders).sort(), probe.name).toEqual(players.sort());
        const row = runVariantProbe(scenario!, probe, 2, "on", "none");
        expect(row).toMatchObject({ kind: "variant", games: 2 });
        // A diagnostic: even a probe that won every game is never a guardrail failure.
        expect(guardrailFailures([{ ...row, wins: 2, winRate: 1 }, row, { ...row, kind: "intended", wins: 2, winRate: 1 }, { ...row, kind: "bad", wins: 0, winRate: 0 }])).toEqual([]);
      }
    }
    const [probe] = variantProbes.cinder_road_wagon_park;
    const scenario = registry.scenario("cinder_road_wagon_park")!;
    const outOfBounds = { ...probe, variants: [{ ...(probe.variants[0] as object), params: { stl_break: { value: 5 } } }] };
    expect(() => runVariantProbe(scenario, outOfBounds, 1)).toThrow(/invalid variant/);
    expect(() => runVariantProbe(scenario, { ...probe, orders: { ...probe.orders, keepers: "v-unknown" } }, 1)).toThrow(/not offered here/);
  });
});
