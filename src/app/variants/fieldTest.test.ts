import { describe, expect, it } from "vitest";
import { doctrineLibrary, firstBreach, holdForDawn, saltmarshColumn, validateVariant, withVariants, type EngineScenario } from "../../game/engine";
import { runFieldTest, verdict, type FieldTestInput, type FieldTestResult } from "./fieldTest";

function inputFor(scenario: EngineScenario, raw: unknown, squadIds: string[], runs = 6): FieldTestInput {
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
    runs,
    firstSeed: scenario.curatedSeed ?? 1,
  };
}

const shieldCut = {
  id: "v-shield_the_line-cut",
  baseId: "shield_the_line",
  name: "Shield the Line (cut)",
  order: ["stl_hold", "stl_brace", "stl_break"],
  params: {},
};

describe("the field test", () => {
  it("fights both sides over the same fortunes and reports every run", () => {
    const shields = Object.entries(firstBreach.referencePlans!.intended).filter(([, id]) => id === "shield_the_line").map(([id]) => id);
    const progress: number[] = [];
    const result = runFieldTest(inputFor(firstBreach, shieldCut, shields), (done) => progress.push(done));
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
    for (const arm of [result.base, result.variant]) {
      expect(arm.victories + arm.stalemates + arm.defeats).toBe(6);
    }
  });

  it("an identical cut plays identically (same seeds, same doctrine rules)", () => {
    const same = { ...shieldCut, order: ["stl_break", "stl_brace", "stl_hold"] };
    const shields = Object.keys(firstBreach.referencePlans!.intended);
    const result = runFieldTest(inputFor(firstBreach, same, shields.filter((id) => firstBreach.referencePlans!.intended[id] === "shield_the_line")));
    expect(result.variant).toEqual(result.base);
  });

  it("runs 60 fortunes of the biggest battle in a few seconds", () => {
    const squad = Object.entries(holdForDawn.referencePlans!.intended).find(([, id]) => id === "shield_the_line")?.[0];
    if (!squad) return;
    const started = performance.now();
    runFieldTest(inputFor(holdForDawn, shieldCut, [squad], 60));
    const seconds = (performance.now() - started) / 1000;
    console.info(`field test, Hold for Dawn, 60 × 2 battles: ${seconds.toFixed(2)} s`);
    expect(seconds).toBeLessThan(20);
  }, 30_000);
});

describe("the verdict", () => {
  const result = (base: number, variant: number, stalemates = [0, 0]): FieldTestResult => ({
    runs: 60,
    base: { victories: base, stalemates: stalemates[0], defeats: 60 - base - stalemates[0] },
    variant: { victories: variant, stalemates: stalemates[1], defeats: 60 - variant - stalemates[1] },
  });
  const shield = doctrineLibrary.shield_the_line;

  it("speaks to the battle's goal", () => {
    expect(verdict(result(30, 37), firstBreach, shield).line).toMatch(/^Holds .+ more often \(\+12%\)$/);
    expect(verdict(result(30, 37), saltmarshColumn, shield).line).toBe("Gets the Column out more often (+12%)");
    expect(verdict(result(37, 30), holdForDawn, shield)).toEqual({ line: "Breaks them less often (−12%)", tone: "worse" });
  });

  it("calls small differences even, but notices fewer defeats", () => {
    expect(verdict(result(30, 32), firstBreach, shield)).toEqual({ line: "About the same as Shield the Line", tone: "even" });
    expect(verdict(result(30, 31, [0, 6]), firstBreach, shield).tone).toBe("better");
  });
});
