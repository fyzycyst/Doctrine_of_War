// The pursuit's role ablation: hundreds of simulated battles, so it runs under
// `npm run test:balance` (the *.sim.test.ts convention, docs/CAMPAIGN.md), not `npm test`.
import { describe, expect, it } from "vitest";
import { cinderRoad5 } from "../engine/scenarios/cinderRoad5";
import { advanceRate } from "../engine/testKit";
import type { Orders } from "../engine/types";
import { HUNT } from "./cinderRoad5.roles.testkit";
import { nonFillers } from "./roles.testkit";

const plans = cinderRoad5.referencePlans!;
const hunt = (doctrineId: string): Orders => ({ ...plans.intended, ...Object.fromEntries(HUNT.posts.map((id) => [id, doctrineId])) });

describe("Cut the Retreat: the hunt (simulation)", () => {
  // Role ablation (docs/CAMPAIGN.md; the pursuit exception keeps it): replace every doctrine
  // that fills the hunt with the best doctrine that does not; with no muster it must cost >= 15
  // points. The hunt, by function: break fleeing companies before they reach the gate.
  it("the hunt earns its place: nothing that only stands or gives ground cuts the column down", () => {
    const base = advanceRate(cinderRoad5, plans.intended);
    expect(base).toBeGreaterThanOrEqual(0.75);
    const best = Math.max(...nonFillers(cinderRoad5, HUNT).map((doctrineId) => advanceRate(cinderRoad5, hunt(doctrineId))));
    expect(base - best).toBeGreaterThanOrEqual(0.15);
  });

  it("the bad plan (Open a Road's guard misapplied: everyone stands fast) stays near zero", () => {
    expect(advanceRate(cinderRoad5, plans.bad)).toBeLessThanOrEqual(0.1);
  });
});
