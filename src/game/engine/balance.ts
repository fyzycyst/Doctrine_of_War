// Monte Carlo balance harness (tech plan §4a). Plays every reference plan and
// every mono-doctrine plan across many seeds and checks the guardrails:
// doctrine decides the odds; fortune decides the moment.
import { doctrineLibrary } from "./doctrines";
import { validateVariant, withVariants } from "./editor";
import { heuristicMuster, rushMuster, type MusterPolicy } from "./muster";
import { createInitialState, resolvePhase } from "./resolvePhase";
import type { DoctrineLibrary, EngineScenario, EngineState, FortuneMode, Orders } from "./types";

export const GUARDRAILS = {
  /** The intended plan must win at least this often. */
  intendedMin: 0.75,
  /** The named bad plan must win at most this often. */
  badMax: 0.35,
  /** No "everyone on doctrine X" plan may ADVANCE (win or stalemate) this often. */
  monoMax: 0.6,
};

export type Guardrails = typeof GUARDRAILS;

/** How many binomial standard errors the smoke suite gives each threshold. */
export const SMOKE_STANDARD_ERRORS = 2;

/**
 * The thresholds a small-N SMOKE run is judged by: each gated threshold moved toward
 * leniency by SMOKE_STANDARD_ERRORS binomial standard errors at `seeds` games,
 * sqrt(p(1-p)/n) at p = the threshold. At 60 seeds: intended 75% -> ~63.8%, bad 35% ->
 * ~47.3%, mono 60% -> ~72.6%. The sign-off is the 500-seed gate run at GUARDRAILS
 * exactly; the smoke suite only catches gross regressions without flaking on a window.
 */
export function smokeGuardrails(seeds: number): Guardrails {
  const se = (p: number) => Math.sqrt((p * (1 - p)) / seeds);
  return {
    intendedMin: GUARDRAILS.intendedMin - SMOKE_STANDARD_ERRORS * se(GUARDRAILS.intendedMin),
    badMax: GUARDRAILS.badMax + SMOKE_STANDARD_ERRORS * se(GUARDRAILS.badMax),
    monoMax: GUARDRAILS.monoMax + SMOKE_STANDARD_ERRORS * se(GUARDRAILS.monoMax),
  };
}

/**
 * "alternative": the scenario's strongest known alternative plan, a diagnostic row (never gated).
 * "variant": an editor-variant probe (variantProbes.ts), a diagnostic row (never gated).
 */
export type PlanKind = "intended" | "bad" | "mono" | "alternative" | "variant";

export interface BalancePlan {
  name: string;
  kind: PlanKind;
  orders: Orders;
}

export interface BalanceRow extends BalancePlan {
  games: number;
  wins: number;
  winRate: number;
  /** Timeouts with neither side's goal met. Not wins: the guardrails only count victories. */
  stalemates: number;
  stalemateRate: number;
  /** Mean final integrity of the first objective (holdObjective scenarios), else null. */
  meanObjective: number | null;
}

/**
 * One battle with fixed orders. `muster` is how the player repositions each command
 * window: "none" (never), "heuristic" (heuristicMuster: relieve the worn, close idle
 * companies on the fight), or "rush" (rushMuster: every fighting company steps toward the
 * enemy objective, the adversarial check that strength alone cannot skip a role). Each
 * reads only the player's view.
 */
export function playBattle(
  scenario: EngineScenario,
  orders: Orders,
  seed: number,
  fortune: FortuneMode,
  muster: MusterPolicy = "none",
  doctrines: DoctrineLibrary = doctrineLibrary,
): EngineState {
  let state = createInitialState(scenario, { seed, fortune });
  while (state.status === "command") {
    const moves = muster === "heuristic" ? heuristicMuster(state, scenario) : muster === "rush" ? rushMuster(state, scenario) : [];
    state = resolvePhase(state, orders, scenario, { muster: moves, doctrines }).state;
  }
  return state;
}

export function balancePlans(scenario: EngineScenario): BalancePlan[] {
  // Noncombatants keep their fixed doctrine; the player never orders them.
  const playerSquads = scenario.squads.filter((squad) => squad.faction === scenario.playerFaction && !squad.noncombatant);
  if (!scenario.referencePlans) {
    throw new Error(`Scenario ${scenario.id} has no referencePlans; the balance guardrails need intended and bad plans`);
  }
  const plans: BalancePlan[] = [
    { name: "intended", kind: "intended", orders: scenario.referencePlans.intended },
    { name: "bad", kind: "bad", orders: scenario.referencePlans.bad },
    ...(scenario.referencePlans.alternative ? [{ name: "strongest alternative", kind: "alternative" as const, orders: scenario.referencePlans.alternative }] : []),
  ];
  for (const doctrineId of scenario.playerDoctrineIds) {
    plans.push({
      name: `all ${doctrineId}`,
      kind: "mono",
      orders: Object.fromEntries(playerSquads.map((squad) => [squad.id, doctrineId])),
    });
  }
  return plans;
}

/**
 * Seed ranges (P7): balance is tuned on one range and gated on another, held out.
 * - TUNING_SEEDS: what authors iterate on (scratch sweeps, ablation and scenario tests,
 *   curated seeds). Anything goes.
 * - GATE_SEEDS: only the balance gate reads these (`npm run balance`, the per-battle
 *   guardrail tests). Never tune on them; curated seeds must stay out (pack lint).
 * - Sign-off blocks (C3 warden): a battle's sign-off must use a range nobody observed while
 *   tuning it. Block k holds k*100000+1 .. k*100000+500; block 1 is the gate. When a range is
 *   burned for a battle (looked at during its tuning or an adversarial search), its next
 *   sign-off uses the next block (`--range signoff2`, …), and the battle sheet records which
 *   block signed it off (docs/CAMPAIGN.md). Every block is reserved: no curated seed in any.
 * Every plan in a run plays the same seeds, so comparisons between plans stay paired.
 */
export const TUNING_SEEDS = { first: 1, size: 1000 } as const;
export const GATE_SEEDS = { first: 100_001, size: 500 } as const;
/** How many sign-off blocks are reserved (signoff1 = the gate .. signoff9). */
export const SIGNOFF_BLOCKS = 9;

export interface SeedRange {
  /** "tuning", "gate" (sign-off block 1) or "signoff<k>". */
  name: string;
  first: number;
  size: number;
}

/** Sign-off block `block` (1 = the gate). Throws outside 1..SIGNOFF_BLOCKS. */
export function signoffRange(block: number): SeedRange {
  if (!Number.isInteger(block) || block < 1 || block > SIGNOFF_BLOCKS) {
    throw new Error(`Sign-off blocks are 1..${SIGNOFF_BLOCKS}, got ${block}`);
  }
  return { name: block === 1 ? "gate" : `signoff${block}`, first: block * 100_000 + 1, size: GATE_SEEDS.size };
}

/** The seed range a `--range` name selects: "tuning", "gate" (= "signoff1") or "signoff2".."signoff9"; null if unknown. */
export function seedRange(name: string): SeedRange | null {
  if (name === "tuning") return { name, ...TUNING_SEEDS };
  if (name === "gate") return signoffRange(1);
  const block = /^signoff([1-9])$/.exec(name);
  return block && Number(block[1]) <= SIGNOFF_BLOCKS ? signoffRange(Number(block[1])) : null;
}

/** Whether `seed` is one of the held-out gate seeds (sign-off block 1). */
export function isGateSeed(seed: number): boolean {
  return seed >= GATE_SEEDS.first && seed < GATE_SEEDS.first + GATE_SEEDS.size;
}

/** The reserved sign-off range holding `seed`, or null (curated seeds must be in none). */
export function reservedRangeOf(seed: number): SeedRange | null {
  const block = Math.floor((seed - 1) / 100_000);
  if (block < 1 || block > SIGNOFF_BLOCKS) return null;
  const range = signoffRange(block);
  return seed >= range.first && seed < range.first + range.size ? range : null;
}

/**
 * The guardrails are judged with the player-realistic "heuristic" muster; "none" (the
 * player never musters) is checked as a winnability floor. `kinds` limits the plans.
 * Plays `seeds` seeds from `firstSeed` (default: the held-out gate range).
 */
export function runBalance(
  scenario: EngineScenario,
  seeds: number,
  fortune: FortuneMode = "on",
  muster: MusterPolicy = "heuristic",
  kinds: PlanKind[] = ["intended", "bad", "mono", "alternative"],
  firstSeed: number = GATE_SEEDS.first,
): BalanceRow[] {
  if (!Number.isInteger(seeds) || seeds < 1) {
    throw new Error(`Seed count must be a positive integer, got ${seeds}`);
  }
  if (!Number.isInteger(firstSeed) || firstSeed < 1) {
    throw new Error(`First seed must be a positive integer, got ${firstSeed}`);
  }
  const reserved = reservedRangeOf(firstSeed);
  if (reserved && reserved.first === firstSeed && seeds > reserved.size) {
    throw new Error(`The ${reserved.name} range holds ${reserved.size} seeds, not ${seeds}`);
  }
  return balancePlans(scenario).filter((plan) => kinds.includes(plan.kind)).map((plan) => {
    let wins = 0;
    let stalemates = 0;
    let objectiveSum = 0;
    for (let seed = firstSeed; seed < firstSeed + seeds; seed += 1) {
      const final = playBattle(scenario, plan.orders, seed, fortune, muster);
      wins += final.status === "victory" ? 1 : 0;
      stalemates += final.status === "stalemate" ? 1 : 0;
      objectiveSum += final.objectives[0]?.integrity ?? 0;
    }
    const hold = scenario.winCondition.kind === "holdObjective";
    return {
      ...plan,
      games: seeds,
      wins,
      winRate: wins / seeds,
      stalemates,
      stalemateRate: stalemates / seeds,
      meanObjective: hold ? objectiveSum / seeds : null,
    };
  });
}

/**
 * An editor-variant probe (docs/CAMPAIGN.md, "editor variants are diagnostics"): variants a
 * player could cut in the doctrine editor, and orders that use them. Variants that out-think
 * a battle are a reward for skill (what Test in the field is for), so a probe is reported as a
 * diagnostic row and never gated; the gate guarantees the lesson for stock doctrines and
 * legal musters. Recorded per battle in variantProbes.ts.
 */
export interface VariantProbe {
  name: string;
  /** The variants exactly as the editor saves them; validated like any loaded variant. */
  variants: unknown[];
  /** Every player company's orders; may name the variants' ids. */
  orders: Orders;
  /** The muster policies to play it with (default: none and heuristic). */
  musters?: MusterPolicy[];
}

/**
 * Plays an editor-variant probe on `scenario` (a named call's assembled battle works too).
 * Fails closed: a variant the editor would refuse, or one whose base this battle does not
 * offer, throws, as do orders naming an unknown doctrine.
 */
export function runVariantProbe(
  scenario: EngineScenario,
  probe: VariantProbe,
  seeds: number,
  fortune: FortuneMode = "on",
  muster: MusterPolicy = "none",
  firstSeed: number = GATE_SEEDS.first,
): BalanceRow {
  const checked = probe.variants.map((raw) => {
    const result = validateVariant(raw, doctrineLibrary, scenario.playerDoctrineIds);
    if (!result.ok) throw new Error(`Probe "${probe.name}": invalid variant (${result.errors.join("; ")})`);
    return result;
  });
  const played = withVariants(scenario, checked, doctrineLibrary);
  for (const [squadId, doctrineId] of Object.entries(probe.orders)) {
    if (!played.scenario.playerDoctrineIds.includes(doctrineId)) throw new Error(`Probe "${probe.name}": ${squadId} is ordered to ${doctrineId}, not offered here`);
  }
  let wins = 0;
  let stalemates = 0;
  for (let seed = firstSeed; seed < firstSeed + seeds; seed += 1) {
    const final = playBattle(played.scenario, probe.orders, seed, fortune, muster, played.doctrines);
    wins += final.status === "victory" ? 1 : 0;
    stalemates += final.status === "stalemate" ? 1 : 0;
  }
  return { name: `${probe.name} (${muster} muster)`, kind: "variant", orders: probe.orders, games: seeds, wins, winRate: wins / seeds, stalemates, stalemateRate: stalemates / seeds, meanObjective: null };
}

/**
 * "full": every guardrail. "floor": a winnability floor only (the intended plan
 * advances >= intendedMin, the bad plan advances <= badMax, no mono cap), used for
 * the campaign's "rough" reference roster.
 */
export type GuardrailPolicy = "full" | "floor";

/**
 * The harrying exception (docs/CAMPAIGN.md, "harrying battles"): a harrying battle has one counted role,
 * the hunt, and the monos of its filler doctrines are harrying done right, so they are not
 * held to the mono cap. Every other mono, and every plan that leaves the hunt unfilled, is
 * still gated. Keyed by scenario id; a battle not listed here is unaffected.
 */
export const HARRYING_FILLERS: Readonly<Record<string, readonly string[]>> = {
  cinder_road_gate_road: ["clean_counterstroke", "bring_the_water", "open_the_road"],
};

/** The doctrine a mono row plays (every post on the same doctrine), or null. */
function monoDoctrine(row: BalanceRow): string | null {
  const doctrines = new Set(Object.values(row.orders));
  return row.kind === "mono" && doctrines.size === 1 ? [...doctrines][0] : null;
}

/**
 * Human-readable guardrail failures; empty only when the scenario is provably in balance
 * (fails closed). `capExempt`: doctrines whose monos the mono cap skips (HARRYING_FILLERS).
 */
export function guardrailFailures(rows: BalanceRow[], policy: GuardrailPolicy = "full", limits: Guardrails = GUARDRAILS, capExempt: readonly string[] = []): string[] {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const missing = (["intended", "bad"] as const)
    .filter((kind) => !rows.some((row) => row.kind === kind))
    .map((kind) => `no ${kind} plan was played`);
  return missing.concat(rows.flatMap((row) => {
    if (!Number.isFinite(row.winRate) || row.games < 1) {
      return [`${row.name} has no valid win rate (${row.wins}/${row.games})`];
    }
    if (policy === "floor") {
      const advance = row.winRate + row.stalemateRate;
      if (row.kind === "intended" && advance < limits.intendedMin) {
        return [`intended plan advances ${pct(advance)} (< ${pct(limits.intendedMin)})`];
      }
      if (row.kind === "bad" && advance > limits.badMax) {
        return [`bad plan advances ${pct(advance)} (> ${pct(limits.badMax)})`];
      }
      return [];
    }
    if (row.kind === "intended" && row.winRate < limits.intendedMin) {
      return [`intended plan wins ${pct(row.winRate)} (< ${pct(limits.intendedMin)})`];
    }
    if (row.kind === "bad" && row.winRate > limits.badMax) {
      return [`bad plan wins ${pct(row.winRate)} (> ${pct(limits.badMax)})`];
    }
    if (row.kind === "mono" && row.winRate + row.stalemateRate >= limits.monoMax && !capExempt.includes(monoDoctrine(row) ?? "")) {
      return [`${row.name} advances ${pct(row.winRate + row.stalemateRate)} (>= ${pct(limits.monoMax)})`];
    }
    return [];
  }));
}

export function formatTable(scenario: EngineScenario, rows: BalanceRow[]): string {
  const header = `${scenario.title}: ${rows[0]?.games ?? 0} seeds per plan`;
  const lines = rows.map((row) => {
    const objective = row.meanObjective === null ? "" : `  mean objective ${row.meanObjective.toFixed(1).padStart(5)}`;
    const pct = (value: number) => `${(value * 100).toFixed(1).padStart(5)}%`;
    return `  ${row.name.padEnd(26)} ${row.kind.padEnd(8)} ${pct(row.winRate)} wins  ${pct(row.stalemateRate)} stalemates${objective}`;
  });
  return [header, ...lines].join("\n");
}
