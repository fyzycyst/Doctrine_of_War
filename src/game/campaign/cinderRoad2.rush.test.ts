// Cinder Road battle 2 (C2): the rush adversary on every named call. Strength alone must not
// skip a role: a plan that leaves the guard unfilled stays below the floor even when the
// player rushes every fighting company at the park (rushMuster), or only the march (the
// warden's re-check: keepers on Shield the Line left at their post, the vans rushed), and the
// observable confirms nobody guarded. A march left unfilled stays below the floor too.
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import type { Orders } from "../engine/types";
import { BTW, calls, rates, SEEDS, unfilledSlack } from "./cinderRoad2.roles.testkit";

describe("Strike the Wagon Park: an unfilled role loses to the rush too, on every call", () => {
  for (const call of calls) {
    it(`[${call.name}] the rush (everyone, or the march alone) stays below the floor`, () => {
      const plans = call.scenario.referencePlans!;
      const marchers = Object.keys(plans.intended).filter((id) => plans.intended[id] === BTW);
      const unguarded: [string, Orders][] = [
        ...[BTW, "shield_the_line", "fighting_withdrawal", "rescue_standard"].map((id): [string, Orders] => [`keepers on ${id}`, { ...plans.intended, keepers: id }]),
        ["the pure march", plans.bad],
      ];
      const failures: string[] = [];
      for (const muster of ["rush", "rush the march"] as const) {
        for (const [name, orders] of unguarded) {
          const result = rates(call.scenario, orders, muster);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance}`);
          if (result.guarded > SEEDS * unfilledSlack(muster)) failures.push(`${name} (${muster}) guarded in ${result.guarded}/${SEEDS}: not an unfilled plan`);
        }
      }
      for (const id of ["shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "hold_for_dawn"]) {
        const result = rates(call.scenario, { ...plans.intended, ...Object.fromEntries(marchers.map((squadId) => [squadId, id])) }, "rush");
        if (result.advance >= GUARDRAILS.intendedMin) failures.push(`the march on ${id} (rush) advances ${result.advance}`);
        if (result.marched > 0) failures.push(`the march on ${id} (rush) struck the park in ${result.marched}/${SEEDS}: not an unfilled plan`);
      }
      expect(failures).toEqual([]);
    }, 90_000);
  }
});
