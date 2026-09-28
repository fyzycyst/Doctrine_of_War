// npm run balance -- [--seeds 500] [--fortune on|off] [--scenario first_breach]
// Prints win rates for each plan. Fails closed: bad arguments, an unknown scenario,
// missing reference plans or any guardrail failure all exit non-zero.
import { formatTable, GUARDRAILS, guardrailFailures, runBalance } from "../src/game/engine/balance";
import { scenarios } from "../src/game/engine/scenarios";
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
  `Guardrails: intended >= ${GUARDRAILS.intendedMin * 100}%, bad <= ${GUARDRAILS.badMax * 100}%, ` +
    `every mono plan advances (wins + stalemates) < ${GUARDRAILS.monoMax * 100}%   (fortune ${fortune})\n`,
);

let failed = false;
for (const scenario of selected) {
  try {
    const rows = runBalance(scenario, seeds, fortune as FortuneMode);
    console.log(formatTable(scenario, rows));
    const failures = guardrailFailures(rows);
    console.log(failures.length === 0 ? "  PASS\n" : failures.map((failure) => `  FAIL ${failure}`).join("\n") + "\n");
    failed ||= failures.length > 0;
  } catch (error) {
    console.error(`  FAIL ${scenario.id}: ${(error as Error).message}\n`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
