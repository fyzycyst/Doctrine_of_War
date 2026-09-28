// npm run balance -- [--seeds 500] [--fortune on|off] [--scenario first_breach]
// Prints win rates for each plan and exits 1 if any guardrail fails.
import { formatTable, GUARDRAILS, guardrailFailures, runBalance } from "../src/game/engine/balance";
import { scenarios } from "../src/game/engine/scenarios";
import type { FortuneMode } from "../src/game/engine/types";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const seeds = Number(arg("seeds", "500"));
const fortune = arg("fortune", "on") as FortuneMode;
const only = arg("scenario", "");

console.log(
  `Guardrails: intended >= ${GUARDRAILS.intendedMin * 100}%, bad <= ${GUARDRAILS.badMax * 100}%, ` +
    `every mono plan < ${GUARDRAILS.monoMax * 100}%   (fortune ${fortune})\n`,
);

let failed = false;
for (const scenario of scenarios.filter((item) => !only || item.id === only)) {
  const rows = runBalance(scenario, seeds, fortune);
  console.log(formatTable(scenario, rows));
  const failures = guardrailFailures(rows);
  console.log(failures.length === 0 ? "  PASS\n" : failures.map((failure) => `  FAIL ${failure}`).join("\n") + "\n");
  failed ||= failures.length > 0;
}
process.exit(failed ? 1 : 0);
