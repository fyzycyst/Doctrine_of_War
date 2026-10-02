import { describe, expect, it } from "vitest";
import { formatTable, guardrailFailures, runBalance } from "./balance";
import { ashAndBanner } from "../campaign/definition";
import { balanceVariantsFor } from "../campaign/rosters";
import { prototypeScenarios } from "./fixtures/wagonPark";
import { scenarios } from "./scenarios";

/**
 * The small-N guardrail suite for one battle. Each battle gets its own test file so vitest can
 * spread them across workers: a single file that simulated every battle ran ~70 s in one worker,
 * long enough to starve vitest's worker RPC ("Timeout calling onTaskUpdate") under machine load.
 */
export function describeGuardrails(scenarioId: string) {
  const scenario = [...scenarios, ...prototypeScenarios].find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`No scenario ${scenarioId} for the guardrail suite`);
  describe(`balance guardrails: ${scenario.title} (small-N version of npm run balance)`, () => {
    // Campaign battles are checked on every reference roster (see docs/CAMPAIGN.md).
    for (const variant of balanceVariantsFor(ashAndBanner, scenarios, scenario)) {
      it(`[${variant.kind} roster] meets its guardrails over 60 seeds with fortune on`, () => {
        // Judged with the player-realistic heuristic muster...
        const rows = runBalance(variant.scenario, 60, "on", "heuristic");
        expect(guardrailFailures(rows, variant.policy), formatTable(variant.scenario, rows)).toEqual([]);
        // ...and still winnable by a player who never musters.
        const still = runBalance(variant.scenario, 60, "on", "none", ["intended", "bad"]);
        expect(guardrailFailures(still, "floor"), formatTable(variant.scenario, still)).toEqual([]);
      }, 90_000); // hundreds of simulated battles; the 5 s default times out under full-suite load
    }
  });
}

/** Every battle the guardrail suite must cover; a test fails if one lacks its own file. */
export const GUARDRAIL_SCENARIO_IDS = [...scenarios, ...prototypeScenarios].map((scenario) => scenario.id);
