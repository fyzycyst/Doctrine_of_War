// Cinder Road battle 3's role ablation: hundreds of simulated battles, so it runs under
// `npm run test:balance` (the *.sim.test.ts convention, docs/CAMPAIGN.md), not `npm test`.
import { describe, expect, it } from "vitest";
import { cinderRoad3 } from "../engine/scenarios/cinderRoad3";
import { advanceRate } from "../engine/testKit";
import type { Orders } from "../engine/types";
import { GUARD, MARCH, OTR } from "./cinderRoad3.roles.testkit";
import { nonFillers, type RoleDeclaration } from "./roles.testkit";

const plans = cinderRoad3.referencePlans!;
const on = (role: RoleDeclaration, doctrineId: string): Orders => ({ ...plans.intended, ...Object.fromEntries(role.posts.map((id) => [id, doctrineId])) });
/** The advance with every post of `role` on the best stock doctrine that does not fill it (no muster). */
const bestUnfilled = (role: RoleDeclaration) => Math.max(...nonFillers(cinderRoad3, role).map((doctrineId) => advanceRate(cinderRoad3, on(role, doctrineId))));

describe("Open a Road: the roles (simulation)", () => {
  // Role ablation (docs/CAMPAIGN.md): replace every doctrine that fills a role with the best
  // doctrine that does not; with no muster it must cost >= 15 points. The roles, by function:
  // the march gets companies onto the far-bank roads (Open the Road on the column); the guard
  // keeps the Mill Road (the watch stands on it or beside it).
  it("the march earns its place: no other doctrine takes the far-bank roads", () => {
    const base = advanceRate(cinderRoad3, plans.intended);
    expect(base).toBeGreaterThanOrEqual(0.75);
    expect(base - bestUnfilled(MARCH)).toBeGreaterThanOrEqual(0.15);
  });

  it("the guard earns its place: a watch that leaves the Mill Road loses it to the reserve", () => {
    expect(advanceRate(cinderRoad3, plans.intended) - bestUnfilled(GUARD)).toBeGreaterThanOrEqual(0.15);
  });

  it("the bad plan (everyone on Bring the Water) and the pure march stay near zero", () => {
    expect(advanceRate(cinderRoad3, plans.bad)).toBeLessThanOrEqual(0.1);
    expect(advanceRate(cinderRoad3, Object.fromEntries(Object.keys(plans.intended).map((id) => [id, OTR])))).toBeLessThanOrEqual(0.1);
  });
});
