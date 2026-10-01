// npm run balance -- [--seeds 500] [--fortune on|off] [--scenario first_breach] [--roster all|baseline|strong|rough]
// Prints win rates for each plan. Fails closed: bad arguments, an unknown scenario,
// missing reference plans or any guardrail failure all exit non-zero.
import { formatTable, GUARDRAILS, guardrailFailures, runBalance } from "../src/game/engine/balance";
import { scenarios } from "../src/game/engine/scenarios";
import { ashAndBanner } from "../src/game/campaign/definition";
import { balanceVariantsFor } from "../src/game/campaign/rosters";
import type { FortuneMode } from "../src/game/engine/types";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function fail(message: string): never {
  console.error(`balance: ${message}`);
  process.exit(1);
}

const seeds = Number(arg("seeds", "500"));
const fortune = arg("fortune", "on");
const only = arg("scenario", "");
const roster = arg("roster", "all");
if (!["all", "baseline", "strong", "rough"].includes(roster)) {
  console.error(`balance: --roster must be all, baseline, strong or rough (got "${roster}")`);
  process.exit(1);
}

if (!Number.isInteger(seeds) || seeds < 1) {
  fail(`--seeds must be a positive integer (got "${arg("seeds", "500")}")`);
}
if (fortune !== "on" && fortune !== "off") {
  fail(`--fortune must be "on" or "off" (got "${fortune}")`);
}
const selected = scenarios.filter((item) => !only || item.id === only);
if (selected.length === 0) {
  fail(`unknown scenario "${only}" (known: ${scenarios.map((item) => item.id).join(", ")})`);
}

console.log(
  `Guardrails (heuristic muster): intended >= ${GUARDRAILS.intendedMin * 100}%, bad <= ${GUARDRAILS.badMax * 100}%, ` +
    `every mono plan advances (wins + stalemates) < ${GUARDRAILS.monoMax * 100}%   (fortune ${fortune}); ` +
    `with no muster, intended still advances >= ${GUARDRAILS.intendedMin * 100}%\n`,
);

let failed = false;
for (const scenario of selected) {
  try {
    // Campaign battles are balanced against three rosters: baseline and strong with the
    // full guardrails, rough (a bad run) as a winnability floor. See docs/CAMPAIGN.md.
    for (const variant of balanceVariantsFor(ashAndBanner, scenarios, scenario).filter((item) => roster === "all" || item.kind === roster)) {
      const rows = runBalance(variant.scenario, seeds, fortune as FortuneMode);
      const label = { ...variant.scenario, title: `${scenario.title} [${variant.kind} roster${variant.policy === "floor" ? ", floor only" : ""}]` };
      console.log(formatTable(label, rows));
      if (variant.roster) console.log(`  roster: ${variant.roster}`);
      const failures = guardrailFailures(rows, variant.policy);
      // A player who never musters must still be able to win (a winnability floor).
      const still = runBalance(variant.scenario, seeds, fortune as FortuneMode, "none", ["intended", "bad"]);
      const pct = (row: (typeof still)[number]) => `${(row.winRate * 100).toFixed(1)}% wins + ${(row.stalemateRate * 100).toFixed(1)}% stalemates`;
      console.log(`  no muster: intended ${pct(still[0])}, bad ${pct(still[1])}`);
      failures.push(...guardrailFailures(still, "floor").map((failure) => `no muster: ${failure}`));
      console.log(failures.length === 0 ? "  PASS\n" : failures.map((failure) => `  FAIL ${failure}`).join("\n") + "\n");
      failed ||= failures.length > 0;
    }
  } catch (error) {
    console.error(`  FAIL ${scenario.id}: ${(error as Error).message}\n`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
