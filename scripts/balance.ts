// npm run balance -- [--seeds 500] [--range gate|tuning|signoff2..signoff9] [--fortune on|off] [--scenario first_breach] [--roster all|<kind>]
// --range: "gate" (default) plays the held-out gate seeds (GATE_SEEDS, 100001..100500), the
// merge gate; "tuning" plays TUNING_SEEDS from 1, for iterating. Never tune on the gate range.
// "signoff<k>" plays reserved sign-off block k (k*100000+1..+500): a battle whose gate range
// was observed during its tuning signs off on the next unobserved block (docs/CAMPAIGN.md).
// Kinds: baseline, strong, rough (fixed campaigns); recommended, curated, rough, greedy,
// weakest, role, carried-recommended, carried-greedy (Roll campaigns' named calls).
// Prints win rates for each plan. Fails closed: bad arguments, an unknown scenario,
// missing reference plans or any guardrail failure all exit non-zero.
import { formatTable, GUARDRAILS, guardrailFailures, PURSUIT_FILLERS, runBalance, runVariantProbe, seedRange, SIGNOFF_BLOCKS, type BalanceRow } from "../src/game/engine/balance";
import { variantProbes } from "../src/game/engine/variantProbes";
import { scenarios as introScenarios } from "../src/game/engine/scenarios";
import { prototypeScenarios } from "../src/game/engine/fixtures";
import { ashAndBanner } from "../src/game/campaign/definition";
import { balanceMatrixIn, introCarrySource } from "../src/game/campaign/rosters";
import { rollDiagnostics } from "../src/game/campaign/rollCalls";
import { registry } from "../src/game/packs/registry";
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
const KINDS = ["all", "baseline", "strong", "rough", "recommended", "curated", "greedy", "weakest", "role", "carried-recommended", "carried-greedy"];
if (!KINDS.includes(roster)) {
  console.error(`balance: --roster must be one of ${KINDS.join(", ")} (got "${roster}")`);
  process.exit(1);
}

if (!Number.isInteger(seeds) || seeds < 1) {
  fail(`--seeds must be a positive integer (got "${arg("seeds", "500")}")`);
}
if (fortune !== "on" && fortune !== "off") {
  fail(`--fortune must be "on" or "off" (got "${fortune}")`);
}
const range = arg("range", "gate");
const span = seedRange(range) ?? fail(`--range must be "gate", "tuning" or "signoff2".."signoff${SIGNOFF_BLOCKS}" (got "${range}")`);
if (seeds > span.size) {
  fail(`the ${range} range holds ${span.size} seeds (got --seeds ${seeds})`);
}
const firstSeed = span.first;
// Every pack scenario (the intro, then Cinder Road); engine prototypes (test fixtures, not
// shipped) run only when named: --scenario <id>.
const scenarios = registry.scenarios();
const campaigns = registry.packs.flatMap((pack) => pack.campaigns);
const selected = only ? [...scenarios, ...prototypeScenarios].filter((item) => item.id === only) : scenarios;
if (selected.length === 0) {
  fail(`unknown scenario "${only}" (known: ${[...scenarios, ...prototypeScenarios].map((item) => item.id).join(", ")})`);
}

console.log(
  `Guardrails (heuristic muster): intended >= ${GUARDRAILS.intendedMin * 100}%, bad <= ${GUARDRAILS.badMax * 100}%, ` +
    `every mono plan advances (wins + stalemates) < ${GUARDRAILS.monoMax * 100}%   (fortune ${fortune}); ` +
    `with no muster, intended still advances >= ${GUARDRAILS.intendedMin * 100}%\n` +
    `Seeds: ${range} range, ${firstSeed}..${firstSeed + seeds - 1}\n`,
);

let failed = false;
for (const scenario of selected) {
  try {
    // Fixed campaigns: baseline, strong (full) and rough (floor). Roll campaigns: the named
    // calls (rollCalls.ts) and their diagnostics. See docs/CAMPAIGN.md.
    const carryFrom = () => introCarrySource(ashAndBanner, introScenarios, "first_call");
    const played: { name: string; rows: BalanceRow[] }[] = [];
    const playedNone: { name: string; rows: BalanceRow[] }[] = [];
    const matrix = balanceMatrixIn(campaigns, scenarios, scenario, carryFrom);
    for (const missing of matrix.notApplicable) console.log(`${scenario.title} [${missing.name}]: NOT APPLICABLE (${missing.reason})\n`);
    for (const variant of matrix.variants.filter((item) => roster === "all" || item.kind === roster)) {
      const rows = runBalance(variant.scenario, seeds, fortune as FortuneMode, "heuristic", ["intended", "bad", "mono", "alternative"], firstSeed);
      const name = variant.name ?? `${variant.kind} roster`;
      played.push({ name, rows });
      const policy = variant.policy === "floor" ? ", floor only" : variant.policy === "diagnostic" ? ", diagnostic" : "";
      const label = { ...variant.scenario, title: `${scenario.title} [${name}${policy}]` };
      console.log(formatTable(label, rows));
      if (variant.roster) console.log(`  roster: ${variant.roster}`);
      const capExempt = PURSUIT_FILLERS[scenario.id] ?? [];
      if (capExempt.length > 0) console.log(`  pursuit exception: monos of the hunt's fillers (${capExempt.join(", ")}) are not capped (docs/CAMPAIGN.md)`);
      const failures = variant.policy === "diagnostic" ? [] : guardrailFailures(rows, variant.policy, GUARDRAILS, capExempt);
      // A player who never musters must still be able to win (a winnability floor).
      const still = runBalance(variant.scenario, seeds, fortune as FortuneMode, "none", ["intended", "bad", "alternative"], firstSeed);
      playedNone.push({ name, rows: still });
      const pct = (row: (typeof still)[number]) => `${(row.winRate * 100).toFixed(1)}% wins + ${(row.stalemateRate * 100).toFixed(1)}% stalemates`;
      const alternativeNone = still.find((row) => row.kind === "alternative");
      console.log(`  no muster: intended ${pct(still[0])}, bad ${pct(still[1])}${alternativeNone ? `, strongest alternative ${pct(alternativeNone)} (diagnostic)` : ""}`);
      if (variant.policy !== "diagnostic") failures.push(...guardrailFailures(still, "floor").map((failure) => `no muster: ${failure}`));
      // Editor-variant probes (variantProbes.ts): reported, never gated (docs/CAMPAIGN.md).
      for (const probe of variantProbes[scenario.id] ?? []) {
        for (const muster of probe.musters ?? ["none", "heuristic"]) {
          const row = runVariantProbe(variant.scenario, probe, seeds, fortune as FortuneMode, muster, firstSeed);
          console.log(`  editor variant (diagnostic): ${row.name}: ${(row.winRate * 100).toFixed(1)}% wins + ${(row.stalemateRate * 100).toFixed(1)}% stalemates`);
        }
      }
      const verdict = variant.policy === "diagnostic" ? "  DIAGNOSTIC (not gated)\n" : "  PASS\n";
      console.log(failures.length === 0 ? verdict : failures.map((failure) => `  FAIL ${failure}`).join("\n") + "\n");
      failed ||= failures.length > 0;
    }
    if (played.length > 1 && played.some(({ name }) => name === "recommended")) {
      // Diagnostics, not gates (synthesis §6; decided on pilot evidence at the Oct 8 gate).
      for (const [muster, results] of [["heuristic muster", played], ["no muster", playedNone]] as const) {
        const d = rollDiagnostics(results);
        const p = (value: number) => `${(value * 100).toFixed(1)}%`;
        console.log(
          `  diagnostics (${muster}): selection spread ${p(d.spread)} (best ${d.best.name} ${p(d.best.advance)}, worst ${d.worst.name} ${p(d.worst.advance)}); ` +
            `plan beats roster: ${d.planBeatsRoster ? "yes" : "NO"} (bad plan at best ${p(d.bestBad.advance)} on ${d.bestBad.name} < intended on worst ${p(d.worst.advance)})` +
            (d.alternative ? `; strongest alternative: intended leads by ${p(d.alternative.lead)} at the closest (${d.alternative.name}, alternative ${p(d.alternative.advance)})` : ""),
        );
      }
      console.log("");
    }
  } catch (error) {
    console.error(`  FAIL ${scenario.id}: ${(error as Error).message}\n`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
