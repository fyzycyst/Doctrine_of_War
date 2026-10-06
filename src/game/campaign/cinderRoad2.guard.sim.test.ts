// Cinder Road battle 2 (C2): the guard role on every named call. A plan that leaves the
// guard unfilled stays below the floor with no muster and with the heuristic muster, and the
// observable confirms nobody guarded (the rush adversary is in cinderRoad2.rush.sim.test.ts). The accepted fillers are not gated; Hold for Dawn and
// the muster-dependent one (Shield the Line mustered onto the walk) are pinned as fillers.
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import type { Orders } from "../engine/types";
import { BTW, calls, rates, SEEDS, unfilledSlack } from "./cinderRoad2.roles.testkit";

describe("Strike the Wagon Park: no plan that leaves the guard unfilled reaches the floor, on every call", () => {
  for (const call of calls) {
    it(`[${call.name}] below the floor with no muster and heuristic muster`, () => {
      const plans = call.scenario.referencePlans!;
      // The keepers on each doctrine that neither holds the walk nor fights the ram, with no
      // muster onto the walk (Shield the Line stays where it was posted), and the pure march.
      const unguarded: [string, Orders][] = [
        ...[BTW, "shield_the_line", "fighting_withdrawal", "rescue_standard"].map((id): [string, Orders] => [`keepers on ${id}`, { ...plans.intended, keepers: id }]),
        ["the pure march", plans.bad],
      ];
      const failures: string[] = [];
      for (const muster of ["none", "heuristic"] as const) {
        for (const [name, orders] of unguarded) {
          const result = rates(call.scenario, orders, muster);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance}`);
          // Unfilled means unfilled in nearly every game (see unfilledSlack).
          if (result.guarded > SEEDS * unfilledSlack(muster)) failures.push(`${name} (${muster}) guarded in ${result.guarded}/${SEEDS}: not an unfilled plan`);
        }
      }
      expect(failures).toEqual([]);
    }, 90_000);
  }

  it("the accepted fillers guard on every call: Hold for Dawn by its orders, Shield the Line by two legal musters", () => {
    for (const call of calls) {
      const intended = call.scenario.referencePlans!.intended;
      expect(rates(call.scenario, intended, "none").guarded, call.name).toBe(SEEDS);
      const mustered = rates(call.scenario, { ...intended, keepers: "shield_the_line" }, "onto the walk");
      expect(mustered.invalid, call.name).toEqual([]);
      expect(mustered.guarded, call.name).toBe(SEEDS);
    }
  }, 90_000);
});
