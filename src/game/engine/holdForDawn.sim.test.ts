// Hold for Dawn's family ablation: hundreds of simulated battles, so it runs under
// `npm run test:balance` (the *.sim.test.ts convention, docs/CAMPAIGN.md), not `npm test`.
import { describe, expect, it } from "vitest";
import { holdForDawn } from "./scenarios/holdForDawn";
import { advanceRate } from "./testKit";
import type { Orders } from "./types";

const intended = holdForDawn.referencePlans!.intended;
const swap = (from: string, to: string): Orders =>
  Object.fromEntries(Object.entries(intended).map(([id, doctrineId]) => [id, doctrineId === from ? to : doctrineId]));

describe("Hold for Dawn (simulation)", () => {
  it("needs all three families: ablating any one costs at least 15 points of advance rate", () => {
    const base = advanceRate(holdForDawn, intended);
    expect(base).toBeGreaterThanOrEqual(0.75);
    const ablations: Record<string, Orders> = {
      "Shield the Line -> Counterstroke": swap("shield_the_line", "clean_counterstroke"),
      "Rescue Standard -> Counterstroke": swap("rescue_standard", "clean_counterstroke"),
      "Rescue Standard -> Shield the Line": swap("rescue_standard", "shield_the_line"),
      "Counterstroke -> Shield the Line": swap("clean_counterstroke", "shield_the_line"),
    };
    for (const [label, orders] of Object.entries(ablations)) {
      expect(base - advanceRate(holdForDawn, orders), label).toBeGreaterThanOrEqual(0.15);
    }
  }, 60_000);
});
