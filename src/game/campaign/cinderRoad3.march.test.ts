// Cinder Road battle 3 (C3): the march role (the column) on every named call. A plan that
// leaves the march unfilled (every Open the Road post on a doctrine that never takes the
// far-bank roads) stays below the floor with no muster and with the heuristic muster, and the
// observable confirms nobody reached the roads (the rush adversary is in cinderRoad3.rush.test.ts).
import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "../engine/balance";
import { calls, OTR, rates, SEEDS, STAY } from "./cinderRoad3.roles.testkit";

describe("Open a Road: no plan that leaves the march unfilled reaches the floor, on every call", () => {
  for (const call of calls) {
    it(`[${call.name}] below the floor with no muster and heuristic muster`, () => {
      const intended = call.scenario.referencePlans!.intended;
      const column = Object.keys(intended).filter((id) => intended[id] === OTR);
      const failures: string[] = [];
      for (const muster of ["none", "heuristic"] as const) {
        for (const id of STAY) {
          const result = rates(call.scenario, { ...intended, ...Object.fromEntries(column.map((squadId) => [squadId, id])) }, muster);
          if (result.advance >= GUARDRAILS.intendedMin) failures.push(`the column on ${id} (${muster}) advances ${result.advance}`);
          if (result.marched > 0) failures.push(`the column on ${id} (${muster}) reached the roads in ${result.marched}/${SEEDS}: not an unfilled plan`);
        }
      }
      expect(failures).toEqual([]);
    }, 90_000);
  }
});
