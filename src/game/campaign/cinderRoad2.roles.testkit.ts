// Cinder Road battle 2 (C2): the roles by function (docs/CAMPAIGN.md, "roles are defined by
// what they achieve"), observed in a run, and the named calls they are checked on. Used by
// cinderRoad2.guard.test.ts and cinderRoad2.march.test.ts (two files so vitest spreads the
// simulations across workers; see guardrails.testkit.ts).
import { hexDistance, sameHex, type HexCoord } from "../board";
import { GATE_SEEDS } from "../engine/balance";
import { heuristicMuster, validateMuster, type MusterMove, type MusterPolicy } from "../engine/muster";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import { scenarios as intro } from "../engine/scenarios";
import { SLUICE_WALK } from "../engine/scenarios/cinderRoad2";
import type { EngineEvent, EngineScenario, EngineState, Orders } from "../engine/types";
import { registry } from "../packs/registry";
import { cinderRoad } from "./cinderRoad";
import { ashAndBanner } from "./definition";
import { rollCallMatrix } from "./rollCalls";
import { introCarrySource } from "./rosters";

/** Gate seeds per plan and muster policy (the plans checked here sit near 0%, far below the floor). */
export const SEEDS = 40;
const RAM = "kiln_ram";
export const BTW = "bring_the_water";

/** The player's two-step muster that puts the keepers on the Sluice Walk (phase 1, then 2). */
const ONTO_THE_WALK: Record<number, HexCoord> = { 1: { q: 6, r: 2 }, 2: SLUICE_WALK };

export type Muster = MusterPolicy | "onto the walk";

interface RoleRun {
  advanced: boolean;
  /** The guard: a company held the walk when the ram came up to it, or fought the ram before it struck the sluice. Null if the ram never came. */
  guard: boolean | null;
  /** The march: a Banner company struck the wagon park. */
  march: boolean;
  invalidMusters: string[];
}

function musterFor(state: EngineState, scenario: EngineScenario, muster: Muster, invalid: string[]): MusterMove[] {
  if (muster === "heuristic") return heuristicMuster(state, scenario);
  const to = muster === "onto the walk" ? ONTO_THE_WALK[state.phase] : undefined;
  if (!to) return [];
  const moves = [{ squadId: "keepers", to }];
  invalid.push(...Object.values(validateMuster(state, scenario, moves)));
  return moves;
}

function playRoles(scenario: EngineScenario, orders: Orders, seed: number, muster: Muster): RoleRun {
  let state = createInitialState(scenario, { seed, fortune: "on" });
  const invalidMusters: string[] = [];
  let walkHeld: boolean | null = null;
  let fought = false;
  let struck = false;
  let march = false;
  while (state.status === "command") {
    const result = resolvePhase(state, orders, scenario, { muster: musterFor(state, scenario, muster, invalidMusters) });
    for (const event of result.events as EngineEvent[]) {
      if (event.kind === "objectiveDamage" && event.objectiveId === "weir_sluice") struck = true;
      if (event.kind === "objectiveDamage" && event.objectiveId === "wagon_park") march = true;
      if (event.kind === "engagement" && !struck && (event.attackerId === RAM || event.defenderId === RAM)) fought = true;
    }
    state = result.state;
    if (walkHeld === null) {
      const ram = state.squads.find((squad) => squad.id === RAM);
      if (struck || (ram?.status === "active" && hexDistance(ram.hex, SLUICE_WALK) <= 1)) {
        walkHeld = state.squads.some((squad) => squad.faction === "free_banners" && squad.status === "active" && sameHex(squad.hex, SLUICE_WALK));
      }
    }
  }
  return {
    advanced: state.status === "victory" || state.status === "stalemate",
    guard: fought || walkHeld === true ? true : walkHeld,
    march,
    invalidMusters,
  };
}

export function rates(scenario: EngineScenario, orders: Orders, muster: Muster) {
  const runs = Array.from({ length: SEEDS }, (_, index) => playRoles(scenario, orders, GATE_SEEDS.first + index, muster));
  return {
    advance: runs.filter((run) => run.advanced).length / SEEDS,
    guarded: runs.filter((run) => run.guard === true).length,
    marched: runs.filter((run) => run.march).length,
    invalid: runs.flatMap((run) => run.invalidMusters),
  };
}

/** Every named call of battle 2 (rollCallMatrix: ten calls, none not applicable). */
export const calls = rollCallMatrix(cinderRoad, registry.scenarios(), 1, introCarrySource(ashAndBanner, intro, "first_call")).calls;
