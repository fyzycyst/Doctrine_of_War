import { describe, expect, it } from "vitest";
import { doctrineLibrary, firstBreach, holdForDawn, saltmarshColumn, validateVariant, withVariants, type EngineScenario } from "../../game/engine";
import { EARLY_STOP_P, runFieldTest, signTestP, verdict, type FieldTestInput, type FieldTestResult, type Outcome } from "./fieldTest";

function inputFor(scenario: EngineScenario, raw: unknown, squadIds: string[], budget: Partial<FieldTestInput> = {}): FieldTestInput {
  const checked = validateVariant(raw, doctrineLibrary);
  if (!checked.ok) throw new Error(checked.errors.join("; "));
  const played = withVariants(scenario, [checked], doctrineLibrary);
  return {
    scenario: played.scenario,
    doctrines: played.doctrines,
    orders: scenario.referencePlans!.intended,
    squadIds,
    baseId: checked.variant.baseId,
    variantId: checked.variant.id,
    firstSeed: scenario.curatedSeed ?? 1,
    ...budget,
  };
}

const shieldCut = {
  id: "v-shield_the_line-cut",
  baseId: "shield_the_line",
  name: "Shield the Line (cut)",
  order: ["stl_hold", "stl_brace", "stl_break"],
  params: {},
};
const shieldsIn = (scenario: EngineScenario) =>
  Object.entries(scenario.referencePlans!.intended)
    .filter(([, id]) => id === "shield_the_line")
    .map(([id]) => id);

describe("the field test on the real engine", () => {
  it("fights both sides over the same fortunes and reports every battle", () => {
    const progress: number[] = [];
    const result = runFieldTest(inputFor(firstBreach, shieldCut, shieldsIn(firstBreach), { minRuns: 6, maxRuns: 6 }), (done) => progress.push(done));
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.runs).toBe(6);
    for (const arm of [result.base, result.variant]) expect(arm.victories + arm.stalemates + arm.defeats).toBe(6);
  });

  it("an identical cut plays identically: no discordant battles at all", () => {
    const same = { ...shieldCut, order: ["stl_break", "stl_brace", "stl_hold"] };
    const result = runFieldTest(inputFor(firstBreach, same, shieldsIn(firstBreach), { maxRuns: 60 }));
    expect(result.variant).toEqual(result.base);
    expect([result.ahead, result.behind]).toEqual([0, 0]);
    expect(verdict(result, firstBreach).headline).toBe("No real difference");
  });

  it("keeps to its time budget on the biggest battle", () => {
    const squad = shieldsIn(holdForDawn)[0];
    const started = performance.now();
    const result = runFieldTest(inputFor(holdForDawn, shieldCut, [squad]));
    const seconds = (performance.now() - started) / 1000;
    console.info(`field test, Hold for Dawn: ${result.runs} paired battles in ${seconds.toFixed(2)} s (${result.stoppedBy})`);
    expect(result.runs).toBeGreaterThanOrEqual(60);
    expect(seconds).toBeLessThan(8);
  }, 30_000);
});

describe("the adaptive stop", () => {
  const base: Omit<FieldTestInput, "scenario" | "doctrines"> = { orders: {}, squadIds: [], baseId: "base", variantId: "cut", firstSeed: 1 };
  const input = { ...base, scenario: firstBreach, doctrines: doctrineLibrary } as FieldTestInput;
  /** A fake battle: the outcome is a function of the side and the seed. */
  const fake = (outcome: (side: "base" | "cut", seed: number) => Outcome) => (_: FieldTestInput, id: string, seed: number) =>
    outcome(id === "base" ? "base" : "cut", seed);

  it("stops at the first checkpoint once the difference is unmistakable", () => {
    const result = runFieldTest(input, undefined, () => 0, fake((side) => (side === "cut" ? "victory" : "defeat")));
    expect(result).toMatchObject({ runs: 60, ahead: 60, behind: 0, stoppedBy: "clear" });
  });

  it("runs to the seed budget when there is no difference", () => {
    const result = runFieldTest(input, undefined, () => 0, fake((_, seed) => (seed % 2 ? "victory" : "defeat")));
    expect(result).toMatchObject({ runs: 300, ahead: 0, behind: 0, stoppedBy: "runs" });
  });

  it("checks only at checkpoints, past the minimum: a lean that firms up later stops later", () => {
    // Ahead on every 3rd seed, behind on every 9th: clear somewhere past 60, at a multiple of 20.
    const result = runFieldTest(input, undefined, () => 0, fake((side, seed) => (seed % 3 === 0 ? (side === "cut" ? "victory" : "defeat") : seed % 9 === 4 ? (side === "cut" ? "defeat" : "victory") : "stalemate")));
    expect(result.stoppedBy).toBe("clear");
    expect(result.runs % 20).toBe(0);
    expect(result.runs).toBeGreaterThan(60);
    expect(signTestP(result.ahead, result.behind)).toBeLessThan(EARLY_STOP_P);
  });

  it("stops on the time budget, but never below the minimum", () => {
    let clock = 0;
    const slow = (ms: number) => (_: FieldTestInput, id: string, seed: number): Outcome => {
      clock += ms / 2; // two battles per seed
      return (id === "cut") === (seed % 2 === 0) ? "victory" : "defeat";
    };
    // 40 ms a seed: the 3 s budget is spent at seed 75 (time is checked after every seed).
    expect(runFieldTest(input, undefined, () => clock, slow(40))).toMatchObject({ runs: 75, stoppedBy: "time" });
    clock = 0;
    expect(runFieldTest(input, undefined, () => clock, slow(1000))).toMatchObject({ runs: 60, stoppedBy: "time" });
  });
});

describe("run longer", () => {
  const input = { orders: {}, squadIds: [], baseId: "base", variantId: "cut", firstSeed: 1, scenario: firstBreach, doctrines: doctrineLibrary } as FieldTestInput;
  // A mild lean that never clears p < 0.01 at a checkpoint within 400 seeds.
  const lean = (_: FieldTestInput, id: string, seed: number): Outcome =>
    seed % 7 === 0 ? (id === "cut" ? "victory" : "defeat") : seed % 11 === 0 ? (id === "cut" ? "defeat" : "victory") : "stalemate";

  it("continues the same seed sequence: 100 then 300 more equals one run of 400", () => {
    const seeds: number[] = [];
    const play = (i: FieldTestInput, id: string, seed: number) => {
      if (id === "cut") seeds.push(seed);
      return lean(i, id, seed);
    };
    const first = runFieldTest({ ...input, maxRuns: 100 }, undefined, () => 0, play);
    expect(first).toMatchObject({ runs: 100, stoppedBy: "runs" });
    const longer = runFieldTest({ ...input, from: first }, undefined, () => 0, play);
    expect(seeds).toEqual(Array.from({ length: 400 }, (_, i) => i + 1));
    const once = runFieldTest({ ...input, maxRuns: 400 }, undefined, () => 0, lean);
    expect(longer).toEqual({ ...once, extended: true });
    expect(first.runs).toBe(100); // the earlier result is not mutated
  });

  it("gets a fresh time budget and reports progress against the extended total", () => {
    let clock = 0;
    const slow = (i: FieldTestInput, id: string, seed: number): Outcome => {
      clock += 20; // 40 ms a seed
      return lean(i, id, seed);
    };
    const first = runFieldTest(input, undefined, () => clock, slow);
    expect(first).toMatchObject({ runs: 75, stoppedBy: "time" });
    const progress: [number, number][] = [];
    const longer = runFieldTest({ ...input, from: first }, (done, max) => progress.push([done, max]), () => clock, slow);
    expect(longer).toMatchObject({ runs: 150, stoppedBy: "time" });
    expect(progress[0]).toEqual([76, 375]);
  });
});

describe("the sign test", () => {
  it("matches the exact binomial tails", () => {
    expect(signTestP(0, 0)).toBe(1);
    expect(signTestP(6, 0)).toBeCloseTo(0.03125, 6); // 2 × (1/2)^6
    expect(signTestP(5, 5)).toBe(1);
    expect(signTestP(14, 9)).toBeCloseTo(0.4049, 3);
    expect(signTestP(9, 14)).toBeCloseTo(signTestP(14, 9), 12); // two-sided
    expect(signTestP(20, 5)).toBeCloseTo(0.004077, 5);
    expect(signTestP(150, 150)).toBe(1);
    expect(signTestP(300, 0)).toBeGreaterThan(0); // no underflow to a false zero at the budget
  });
});

describe("the verdict", () => {
  const result = (ahead: number, behind: number, runs = 240, wins: [number, number] = [120, 120], stoppedBy: FieldTestResult["stoppedBy"] = "runs", extended = false): FieldTestResult => ({
    runs,
    extended,
    base: { victories: wins[0], stalemates: 0, defeats: runs - wins[0] },
    variant: { victories: wins[1], stalemates: 0, defeats: runs - wins[1] },
    ahead,
    behind,
    stoppedBy,
  });

  it("says 'clearly' only when the paired test is convincing", () => {
    const clear = verdict(result(30, 12, 240, [120, 144]), firstBreach);
    expect(clear).toMatchObject({ headline: "Clearly better", tone: "better" });
    expect(clear.p).toBeLessThan(0.05);
    expect(clear.detail).toBe("Holds Greyford Gate in 60% of 240 battles; the original, 50%.");
    expect(clear.pairs).toBe("Same fortunes, different results in 42 battles: your cut came out ahead in 30, the original in 12.");
    expect(verdict(result(12, 30), holdForDawn)).toMatchObject({ headline: "Clearly worse", tone: "worse" });
    expect(verdict(result(60, 0, 60, [0, 60], "clear"), saltmarshColumn).detail).toBe("Gets the Column out in 100% of 60 battles; the original, 0%.");
  });

  it("holds 'clearly' to the sequential bars: under 0.045, and under 0.01 after Run longer", () => {
    /** A split whose sign-test p falls in [low, high). */
    const splitIn = (low: number, high: number): [number, number] => {
      for (let n = 60; n <= 300; n += 1) {
        for (let a = n; a > n / 2; a -= 1) {
          const q = signTestP(a, n - a);
          if (q >= low && q < high) return [a, n - a];
        }
      }
      throw new Error(`no split with p in [${low}, ${high})`);
    };
    const [a1, b1] = splitIn(0.045, 0.05); // was "clearly" under the old rule
    expect(verdict(result(a1, b1), firstBreach).headline).toBe("Slightly better, not certain");
    const [a2, b2] = splitIn(0.01, 0.045);
    expect(verdict(result(a2, b2), firstBreach).headline).toBe("Clearly better");
    expect(verdict(result(a2, b2, 240, [120, 120], "runs", true), firstBreach).headline).toBe("Slightly better, not certain");
    const [a3, b3] = splitIn(0, 0.01);
    expect(verdict(result(a3, b3, 240, [120, 120], "runs", true), firstBreach).headline).toBe("Clearly better");
  });

  it("hedges a borderline lean, and calls noise noise", () => {
    expect(verdict(result(14, 7), firstBreach)).toMatchObject({ headline: "Slightly better, not certain", tone: "slightly-better" });
    expect(verdict(result(7, 14), firstBreach)).toMatchObject({ headline: "Slightly worse, not certain", tone: "slightly-worse" });
    // The earlier 53% vs 48% First Breach result was this kind of split: not a finding.
    expect(verdict(result(14, 9, 60, [32, 29]), firstBreach)).toMatchObject({ headline: "No real difference", tone: "even" });
    expect(verdict(result(0, 0, 300), firstBreach).pairs).toBe("Same fortunes, same result in every one of the 300 battles.");
  });
});
