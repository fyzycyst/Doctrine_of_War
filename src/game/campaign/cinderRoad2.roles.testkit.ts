// Cinder Road battle 2 (C2): the roles by function (docs/CAMPAIGN.md, "roles are defined by
// what they achieve"), observed in a run, and the named calls they are checked on. The role
// gate (cinderRoad2.roleGate.testkit.ts) runs one file per named call
// (cinderRoad2.roles.<call>.sim.test.ts); cinderRoad2.test.ts checks every call has its file.
// No vitest import here, so scripts can reuse these helpers.
import { hexDistance, sameHex, type HexCoord } from "../board";
import { GATE_SEEDS } from "../engine/balance";
import { heuristicMuster, rushMuster, validateMuster, type MusterMove, type MusterPolicy } from "../engine/muster";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import { scenarios as intro } from "../engine/scenarios";
import { SLUICE_WALK } from "../engine/scenarios/cinderRoad2";
import type { EngineEvent, EngineScenario, EngineState, Orders } from "../engine/types";
import { activeSquads } from "../engine/world";
import { registry } from "../packs/registry";
import { cinderRoad } from "./cinderRoad";
import { ashAndBanner } from "./definition";
import { rollCallMatrix } from "./rollCalls";
import { introCarrySource } from "./rosters";
import type { RoleDeclaration } from "./roles.testkit";

/** Gate seeds per plan and muster policy (the plans checked here sit near 0%, far below the floor). */
export const SEEDS = 40;
const RAM = "kiln_ram";
export const BTW = "bring_the_water";
/**
 * The share of an unfilled plan's games it may WIN with the role filled by accident; more
 * than this and the plan is misclassified: it is winning by filling the role, not without
 * it. Since C5 (routes planned on what the mover knows) a company can meet the ram or stand
 * on the walk on its honest route and still lose, so touching the role is not counted, only
 * winning by it. Tight without muster and with the heuristic; looser against the rush,
 * whose cavalry can run into the ram.
 */
export function unfilledSlack(muster: Muster): number {
  return muster === "rush" || muster === "rush the march" ? 0.1 : 0.05;
}

/** The player's two-step muster that puts the keepers on the Sluice Walk (phase 1, then 2). */
const ONTO_THE_WALK: Record<number, HexCoord> = { 1: { q: 6, r: 2 }, 2: SLUICE_WALK };

/**
 * How the player musters: a harness policy ("none", "heuristic", "rush": every fighting
 * company steps toward the park), "rush the march" (only the companies on Bring the Water
 * rush, the warden's re-check), or "onto the walk" (the keepers' two moves).
 */
export type Muster = MusterPolicy | "rush the march" | "onto the walk";

interface RoleRun {
  advanced: boolean;
  /** The guard: a company held the walk when the ram came up to it, or fought the ram before it struck the sluice. Null if the ram never came. */
  guard: boolean | null;
  /** The march: a Banner company struck the wagon park. */
  march: boolean;
  invalidMusters: string[];
}

function musterFor(state: EngineState, scenario: EngineScenario, orders: Orders, muster: Muster, invalid: string[]): MusterMove[] {
  if (muster === "heuristic") return heuristicMuster(state, scenario);
  if (muster === "rush") return rushMuster(state, scenario);
  if (muster === "rush the march") return rushMuster(state, scenario, Object.keys(orders).filter((id) => orders[id] === BTW));
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
    const result = resolvePhase(state, orders, scenario, { muster: musterFor(state, scenario, orders, muster, invalidMusters) });
    for (const event of result.events as EngineEvent[]) {
      if (event.kind === "objectiveDamage" && event.objectiveId === "weir_sluice") struck = true;
      if (event.kind === "objectiveDamage" && event.objectiveId === "wagon_park") march = true;
      if (event.kind === "engagement" && !struck && (event.attackerId === RAM || event.defenderId === RAM)) fought = true;
    }
    state = result.state;
    if (walkHeld === null) {
      // Only companies still on the field (active, with a hex) count: a routed ram has come no closer.
      const ram = activeSquads(state).find((squad) => squad.id === RAM);
      if (struck || (ram && hexDistance(ram.hex, SLUICE_WALK) <= 1)) {
        walkHeld = activeSquads(state).some((squad) => squad.faction === "free_banners" && sameHex(squad.hex, SLUICE_WALK));
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

export function rates(scenario: EngineScenario, orders: Orders, muster: Muster, seeds = SEEDS, firstSeed: number = GATE_SEEDS.first) {
  const runs = Array.from({ length: seeds }, (_, index) => playRoles(scenario, orders, firstSeed + index, muster));
  return {
    advance: runs.filter((run) => run.advanced).length / seeds,
    guarded: runs.filter((run) => run.guard === true).length,
    /** Games advanced while the role's observable says the guard was filled (by accident, for an unfilled plan). */
    wonGuarded: runs.filter((run) => run.advanced && run.guard === true).length,
    marched: runs.filter((run) => run.march).length,
    invalid: runs.flatMap((run) => run.invalidMusters),
  };
}

/** Every named call of battle 2 (rollCallMatrix: ten calls, none not applicable). */
export const calls = rollCallMatrix(cinderRoad, registry.scenarios(), 1, introCarrySource(ashAndBanner, intro, "first_call")).calls;

/**
 * The roles, as the battle sheet declares them. The guard's fillers by orders are Hold for
 * Dawn and Clean Counterstroke; its third accepted filler, any holding doctrine mustered onto
 * the walk, is muster-dependent and pinned below ("onto the walk"). The standard is an extra.
 */
export const GUARD: RoleDeclaration = { posts: ["keepers"], fillers: ["hold_for_dawn", "clean_counterstroke"] };
export const MARCH: RoleDeclaration = { posts: ["ford_van", "track_van", "sedge_van", "lances"], fillers: [BTW] };
