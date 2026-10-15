// Cinder Road battle 2's role ablation: hundreds of simulated battles, so it runs under
// `npm run test:balance` (the *.sim.test.ts convention, docs/CAMPAIGN.md), not `npm test`.
import { describe, expect, it } from "vitest";
import { cinderRoad2 } from "../engine/scenarios/cinderRoad2";
import { advanceRate } from "../engine/testKit";

const intended = cinderRoad2.referencePlans!.intended;
const BTW = "bring_the_water";

describe("Strike the Wagon Park: the roles (simulation)", () => {
  // Role ablation (docs/CAMPAIGN.md): replace every doctrine that fills a role with the best
  // doctrine that does not; with no muster it must cost >= 15 points. The roles, by function:
  // the march strikes the park (Bring the Water); the guard holds the Sluice Walk or fights
  // the ram (by orders: Hold for Dawn, or Clean Counterstroke; the muster-dependent filler,
  // a holding doctrine mustered onto the walk, is in the role gate (cinderRoad2.roles.<call>.sim.test.ts), with every
  // unfilled plan on every call). The standard's banner (Rescue Standard) is an extra.
  const OTHERS = ["bring_the_water", "shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "hold_for_dawn"];
  const GUARDS_BY_ORDERS = ["hold_for_dawn", "clean_counterstroke"];

  it("each role earns its place (role ablation >= 15 points, no muster)", () => {
    const base = advanceRate(cinderRoad2, intended);
    expect(base).toBeGreaterThanOrEqual(0.75);
    // The sluice guard: the best keeper that does not guard.
    const unguarded = OTHERS.filter((doctrineId) => !GUARDS_BY_ORDERS.includes(doctrineId)).map((doctrineId) => advanceRate(cinderRoad2, { ...intended, keepers: doctrineId }));
    expect(base - Math.max(...unguarded)).toBeGreaterThanOrEqual(0.15);
    for (const rate of unguarded) expect(rate).toBeLessThan(0.75);
    // The march: every Bring the Water post on the best doctrine that does not march.
    const unmarched = OTHERS.filter((doctrineId) => doctrineId !== BTW).map((doctrineId) =>
      advanceRate(cinderRoad2, Object.fromEntries(Object.entries(intended).map(([id, plan]) => [id, plan === BTW ? doctrineId : plan]))),
    );
    expect(base - Math.max(...unmarched)).toBeGreaterThanOrEqual(0.15);
    // The pure march (the bad plan) loses whatever the force: the ram breaks the sluice.
    expect(advanceRate(cinderRoad2, cinderRoad2.referencePlans!.bad)).toBeLessThanOrEqual(0.1);
    // The accepted alternative for the keepers' post wins too, and is the tracked alternative row.
    expect(cinderRoad2.referencePlans!.alternative).toEqual({ ...intended, keepers: "clean_counterstroke" });
    expect(advanceRate(cinderRoad2, cinderRoad2.referencePlans!.alternative!)).toBeGreaterThanOrEqual(0.75);
  }, 90_000);
});
