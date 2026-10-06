// Cinder Road battle 3 (C3): the Mill Road guard on every named call. A plan that leaves the
// guard unfilled (the watch on a doctrine that leaves the Mill Road, or the pure march) stays
// below the floor with no muster and with the heuristic muster, and the observable confirms
// nobody guarded (the rush adversary is in cinderRoad3.rush.test.ts). The accepted fillers
// are not gated; the intended watch (Shield the Line) is pinned as one.
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import { calls, rates, SEEDS, unguarded, UNFILLED_SLACK } from "./cinderRoad3.roles.testkit";

describe("Open a Road: no plan that leaves the guard unfilled reaches the floor, on every call", () => {
  for (const call of calls) {
    it(`[${call.name}] below the floor with no muster and heuristic muster`, () => {
      const failures: string[] = [];
      for (const muster of ["none", "heuristic"] as const) {
        for (const [name, orders] of unguarded(call.scenario.referencePlans!.intended)) {
          const result = rates(call.scenario, orders, muster);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance}`);
          // Unfilled means unfilled in nearly every game (see UNFILLED_SLACK).
          if (result.guarded > SEEDS * UNFILLED_SLACK) failures.push(`${name} (${muster}) guarded in ${result.guarded}/${SEEDS}: not an unfilled plan`);
        }
      }
      expect(failures).toEqual([]);
    }, 90_000);
  }

  it("the intended watch keeps the Mill Road on every call: no Host company gets through", () => {
    for (const call of calls) {
      expect(rates(call.scenario, call.scenario.referencePlans!.intended, "none").breached, call.name).toBe(0);
    }
  }, 90_000);
});
