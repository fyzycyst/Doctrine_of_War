// Cinder Road battle 3 (C3): the rush adversary on every named call. Strength alone must not
// skip a role: a plan that leaves the guard unfilled stays below the floor even when the
// player rushes every fighting company at the far-bank roads (rushMuster), or only the column
// (the companies on Open the Road), and the observable confirms nobody guarded. A march left
// unfilled stays below the floor too, and never reaches the roads.
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import { calls, OTR, rates, SEEDS, STAY, unguarded, UNFILLED_SLACK } from "./cinderRoad3.roles.testkit";

describe("Open a Road: an unfilled role loses to the rush too, on every call", () => {
  for (const call of calls) {
    it(`[${call.name}] the rush (everyone, or the column alone) stays below the floor`, () => {
      const intended = call.scenario.referencePlans!.intended;
      const column = Object.keys(intended).filter((id) => intended[id] === OTR);
      const failures: string[] = [];
      for (const muster of ["rush", "rush the column"] as const) {
        for (const [name, orders] of unguarded(intended)) {
          const result = rates(call.scenario, orders, muster);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`${name} (${muster}) advances ${result.advance}`);
          if (result.guarded > SEEDS * UNFILLED_SLACK) failures.push(`${name} (${muster}) guarded in ${result.guarded}/${SEEDS}: not an unfilled plan`);
        }
      }
      for (const id of STAY) {
        const result = rates(call.scenario, { ...intended, ...Object.fromEntries(column.map((squadId) => [squadId, id])) }, "rush");
        if (result.advance >= GUARDRAILS.intendedMin) failures.push(`the column on ${id} (rush) advances ${result.advance}`);
        if (result.marched > 0) failures.push(`the column on ${id} (rush) reached the roads in ${result.marched}/${SEEDS}: not an unfilled plan`);
      }
      expect(failures).toEqual([]);
    }, 90_000);
  }
});
