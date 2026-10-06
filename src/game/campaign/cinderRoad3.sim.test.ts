// Cinder Road battle 3's role ablation: hundreds of simulated battles, so it runs under
// `npm run test:balance` (the *.sim.test.ts convention, docs/CAMPAIGN.md), not `npm test`.
import { describe, expect, it } from "vitest";
import { cinderRoad3 } from "../engine/scenarios/cinderRoad3";
import { advanceRate } from "../engine/testKit";
import { LEAVE, OTR, STAY, WATCH } from "./cinderRoad3.roles.testkit";

const plans = cinderRoad3.referencePlans!;
const column = Object.keys(plans.intended).filter((id) => plans.intended[id] === OTR);
const columnOn = (doctrineId: string) => ({ ...plans.intended, ...Object.fromEntries(column.map((id) => [id, doctrineId])) });
const watchOn = (doctrineId: string) => ({ ...plans.intended, ...Object.fromEntries(WATCH.map((id) => [id, doctrineId])) });

describe("Open a Road: the roles (simulation)", () => {
  // Role ablation (docs/CAMPAIGN.md): replace every doctrine that fills a role with the best
  // doctrine that does not; with no muster it must cost >= 15 points. The roles, by function:
  // the march gets companies onto the far-bank roads (Open the Road on the column); the guard
  // keeps the Mill Road (the watch stays on it: Shield the Line, or any doctrine that stays).
  it("the march earns its place: no other doctrine takes the far-bank roads", () => {
    const base = advanceRate(cinderRoad3, plans.intended);
    expect(base).toBeGreaterThanOrEqual(0.75);
    expect(base - Math.max(...STAY.map((doctrineId) => advanceRate(cinderRoad3, columnOn(doctrineId))))).toBeGreaterThanOrEqual(0.15);
  }, 30_000);

  it("the guard earns its place: a watch that leaves the Mill Road lets the reserve through", () => {
    const base = advanceRate(cinderRoad3, plans.intended);
    expect(base - Math.max(...LEAVE.map((doctrineId) => advanceRate(cinderRoad3, watchOn(doctrineId))))).toBeGreaterThanOrEqual(0.15);
  }, 30_000);

  it("the bad plan (everyone on Bring the Water) and the pure march stay near zero", () => {
    expect(advanceRate(cinderRoad3, plans.bad)).toBeLessThanOrEqual(0.1);
    expect(advanceRate(cinderRoad3, Object.fromEntries(Object.keys(plans.intended).map((id) => [id, OTR])))).toBeLessThanOrEqual(0.1);
  }, 30_000);
});
