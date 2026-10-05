// Cinder Road battle 2 (C2): the march role on every named call. A plan that leaves the
// march unfilled (every Bring the Water post on another doctrine) stays below the floor with
// no muster and with the heuristic muster, and the observable confirms nobody struck the park.
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import { BTW, calls, rates, SEEDS } from "./cinderRoad2.roles.testkit";

describe("Strike the Wagon Park: no plan that leaves the march unfilled reaches the floor, on every call", () => {
  for (const call of calls) {
    it(`[${call.name}] below the floor with no muster and heuristic muster`, () => {
      const intended = call.scenario.referencePlans!.intended;
      const marchers = Object.keys(intended).filter((id) => intended[id] === BTW);
      const failures: string[] = [];
      for (const muster of ["none", "heuristic"] as const) {
        for (const id of ["shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "hold_for_dawn"]) {
          const orders = { ...intended, ...Object.fromEntries(marchers.map((squadId) => [squadId, id])) };
          const result = rates(call.scenario, orders, muster);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`the march on ${id} (${muster}) advances ${result.advance}`);
          if (result.marched > 0) failures.push(`the march on ${id} (${muster}) struck the park in ${result.marched}/${SEEDS}: not an unfilled plan`);
        }
      }
      expect(failures).toEqual([]);
    }, 90_000);
  }
});
