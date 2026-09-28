// Monte Carlo balance harness (tech plan §4a). Plays every reference plan and
// every mono-doctrine plan across many seeds and checks the guardrails:
// doctrine decides the odds; fortune decides the moment.
import { createInitialState, resolvePhase } from "./resolvePhase";
import type { EngineScenario, EngineState, FortuneMode, Orders } from "./types";

export const GUARDRAILS = {
  /** The intended plan must win at least this often. */
  intendedMin: 0.75,
  /** The named bad plan must win at most this often. */
  badMax: 0.35,
  /** No "everyone on doctrine X" plan may win this often. */
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
  /** Mean final integrity of the first objective (holdObjective scenarios), else null. */
  meanObjective: number | null;
}

export function playBattle(scenario: EngineScenario, orders: Orders, seed: number, fortune: FortuneMode): EngineState {
  let state = createInitialState(scenario, { seed, fortune });
  while (state.status === "command") {
    state = resolvePhase(state, orders, scenario).state;
  }
  return state;
}

export function balancePlans(scenario: EngineScenario): BalancePlan[] {
  const playerSquads = scenario.squads.filter((squad) => squad.faction === scenario.playerFaction);
  const plans: BalancePlan[] = [];
  if (scenario.referencePlans) {
    plans.push({ name: "intended", kind: "intended", orders: scenario.referencePlans.intended });
    plans.push({ name: "bad", kind: "bad", orders: scenario.referencePlans.bad });
  }
  for (const doctrineId of scenario.playerDoctrineIds) {
    plans.push({
      name: `all ${doctrineId}`,
      kind: "mono",
      orders: Object.fromEntries(playerSquads.map((squad) => [squad.id, doctrineId])),
    });
  }
  return plans;
}

export function runBalance(scenario: EngineScenario, seeds: number, fortune: FortuneMode = "on"): BalanceRow[] {
  return balancePlans(scenario).map((plan) => {
    let wins = 0;
    let objectiveSum = 0;
    for (let seed = 1; seed <= seeds; seed += 1) {
      const final = playBattle(scenario, plan.orders, seed, fortune);
      wins += final.status === "victory" ? 1 : 0;
      objectiveSum += final.objectives[0]?.integrity ?? 0;
    }
    const hold = scenario.winCondition.kind === "holdObjective";
    return {
      ...plan,
      games: seeds,
      wins,
      winRate: wins / seeds,
      meanObjective: hold ? objectiveSum / seeds : null,
    };
  });
}

/** Human-readable guardrail failures; empty when the scenario is in balance. */
export function guardrailFailures(rows: BalanceRow[]): string[] {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  return rows.flatMap((row) => {
    if (row.kind === "intended" && row.winRate < GUARDRAILS.intendedMin) {
      return [`intended plan wins ${pct(row.winRate)} (< ${pct(GUARDRAILS.intendedMin)})`];
    }
    if (row.kind === "bad" && row.winRate > GUARDRAILS.badMax) {
      return [`bad plan wins ${pct(row.winRate)} (> ${pct(GUARDRAILS.badMax)})`];
    }
    if (row.kind === "mono" && row.winRate >= GUARDRAILS.monoMax) {
      return [`${row.name} wins ${pct(row.winRate)} (>= ${pct(GUARDRAILS.monoMax)})`];
    }
    return [];
  });
}

export function formatTable(scenario: EngineScenario, rows: BalanceRow[]): string {
  const header = `${scenario.title}: ${rows[0]?.games ?? 0} seeds per plan`;
  const lines = rows.map((row) => {
    const objective = row.meanObjective === null ? "" : `  mean objective ${row.meanObjective.toFixed(1).padStart(5)}`;
    return `  ${row.name.padEnd(26)} ${row.kind.padEnd(8)} ${(row.winRate * 100).toFixed(1).padStart(5)}% wins${objective}`;
  });
  return [header, ...lines].join("\n");
}
