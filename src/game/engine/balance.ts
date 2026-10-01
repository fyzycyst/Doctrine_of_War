// Monte Carlo balance harness (tech plan §4a). Plays every reference plan and
// every mono-doctrine plan across many seeds and checks the guardrails:
// doctrine decides the odds; fortune decides the moment.
import { heuristicMuster, type MusterPolicy } from "./muster";
import { createInitialState, resolvePhase } from "./resolvePhase";
import type { EngineScenario, EngineState, FortuneMode, Orders } from "./types";

export const GUARDRAILS = {
  /** The intended plan must win at least this often. */
  intendedMin: 0.75,
  /** The named bad plan must win at most this often. */
  badMax: 0.35,
  /** No "everyone on doctrine X" plan may ADVANCE (win or stalemate) this often. */
  monoMax: 0.6,
};

export type PlanKind = "intended" | "bad" | "mono";

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
 * window: "none" (never), or "heuristic" (heuristicMuster: relieve the worn, close idle
 * companies on the fight), which reads only the player's view.
 */
export function playBattle(scenario: EngineScenario, orders: Orders, seed: number, fortune: FortuneMode, muster: MusterPolicy = "none"): EngineState {
  let state = createInitialState(scenario, { seed, fortune });
  while (state.status === "command") {
    const moves = muster === "heuristic" ? heuristicMuster(state, scenario) : [];
    state = resolvePhase(state, orders, scenario, { muster: moves }).state;
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
 * The guardrails are judged with the player-realistic "heuristic" muster; "none" (the
 * player never musters) is checked as a winnability floor. `kinds` limits the plans.
 */
export function runBalance(
  scenario: EngineScenario,
  seeds: number,
  fortune: FortuneMode = "on",
  muster: MusterPolicy = "heuristic",
  kinds: PlanKind[] = ["intended", "bad", "mono"],
): BalanceRow[] {
  if (!Number.isInteger(seeds) || seeds < 1) {
    throw new Error(`Seed count must be a positive integer, got ${seeds}`);
  }
  return balancePlans(scenario).filter((plan) => kinds.includes(plan.kind)).map((plan) => {
    let wins = 0;
    let stalemates = 0;
    let objectiveSum = 0;
    for (let seed = 1; seed <= seeds; seed += 1) {
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
 * "full": every guardrail. "floor": a winnability floor only (the intended plan
 * advances >= intendedMin, the bad plan advances <= badMax, no mono cap), used for
 * the campaign's "rough" reference roster.
 */
export type GuardrailPolicy = "full" | "floor";

/** Human-readable guardrail failures; empty only when the scenario is provably in balance (fails closed). */
export function guardrailFailures(rows: BalanceRow[], policy: GuardrailPolicy = "full"): string[] {
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
      if (row.kind === "intended" && advance < GUARDRAILS.intendedMin) {
        return [`intended plan advances ${pct(advance)} (< ${pct(GUARDRAILS.intendedMin)})`];
      }
      if (row.kind === "bad" && advance > GUARDRAILS.badMax) {
        return [`bad plan advances ${pct(advance)} (> ${pct(GUARDRAILS.badMax)})`];
      }
      return [];
    }
    if (row.kind === "intended" && row.winRate < GUARDRAILS.intendedMin) {
      return [`intended plan wins ${pct(row.winRate)} (< ${pct(GUARDRAILS.intendedMin)})`];
    }
    if (row.kind === "bad" && row.winRate > GUARDRAILS.badMax) {
      return [`bad plan wins ${pct(row.winRate)} (> ${pct(GUARDRAILS.badMax)})`];
    }
    if (row.kind === "mono" && row.winRate + row.stalemateRate >= GUARDRAILS.monoMax) {
      return [`${row.name} advances ${pct(row.winRate + row.stalemateRate)} (>= ${pct(GUARDRAILS.monoMax)})`];
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
