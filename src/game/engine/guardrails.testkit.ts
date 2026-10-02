import { describe, expect, it } from "vitest";
import { formatTable, guardrailFailures, runBalance, type BalanceRow } from "./balance";
import { ashAndBanner } from "../campaign/definition";
import { balanceVariantsIn, introCarrySource, type BalanceVariant } from "../campaign/rosters";
import { rollDiagnostics } from "../campaign/rollCalls";
import { registry } from "../packs/registry";
import { prototypeScenarios } from "./fixtures/wagonPark";
import { scenarios } from "./scenarios";

const campaigns = registry.packs.flatMap((pack) => pack.campaigns);
const packScenarios = registry.scenarios();
const carryFrom = () => introCarrySource(ashAndBanner, scenarios, "first_call");

/**
 * The small-N guardrail suite for one battle. Each battle gets its own test file so vitest can
 * spread them across workers: a single file that simulated every battle ran ~70 s in one worker,
 * long enough to starve vitest's worker RPC ("Timeout calling onTaskUpdate") under machine load.
 * Roll battles are checked on every named call (campaign/rollCalls.ts), one test per call.
 */
export function describeGuardrails(scenarioId: string) {
  const scenario = [...packScenarios, ...prototypeScenarios].find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`No scenario ${scenarioId} for the guardrail suite`);
  describe(`balance guardrails: ${scenario.title} (small-N version of npm run balance)`, () => {
    const variants: BalanceVariant[] = balanceVariantsIn(campaigns, packScenarios, scenario, carryFrom);
    const played: { name: string; rows: BalanceRow[] }[] = [];
    // Campaign battles are checked on every reference roster or named call (see docs/CAMPAIGN.md).
    for (const variant of variants) {
      const name = variant.name ?? variant.kind;
      it(`[${variant.name ?? `${variant.kind} roster`}] meets its guardrails over 60 seeds with fortune on`, () => {
        // Judged on the held-out gate seeds (GATE_SEEDS, the default), with the player-realistic heuristic muster...
        const rows = runBalance(variant.scenario, 60, "on", "heuristic");
        played.push({ name, rows });
        // ...and still winnable by a player who never musters.
        const still = runBalance(variant.scenario, 60, "on", "none", ["intended", "bad"]);
        if (variant.policy === "diagnostic") return; // reported only: its recovery force is the recommended call
        expect(guardrailFailures(rows, variant.policy), formatTable(variant.scenario, rows)).toEqual([]);
        expect(guardrailFailures(still, "floor"), formatTable(variant.scenario, still)).toEqual([]);
      }, 90_000); // hundreds of simulated battles; the 5 s default times out under full-suite load
    }
    if (variants.some((variant) => variant.kind === "recommended")) {
      it("reports the selection diagnostics (plan beats roster, selection spread)", () => {
        // Diagnostics, not gates (decided on this evidence at the Oct 8 pilot gate); they
        // must at least be computable over the calls played above (all, unless filtered).
        if (played.length === 0) return;
        const diagnostics = rollDiagnostics(played);
        expect(Number.isFinite(diagnostics.spread)).toBe(true);
      });
    }
  });
}

/** Every battle the guardrail suite must cover; a test fails if one lacks its own file. */
export const GUARDRAIL_SCENARIO_IDS = [...packScenarios, ...prototypeScenarios].map((scenario) => scenario.id);
