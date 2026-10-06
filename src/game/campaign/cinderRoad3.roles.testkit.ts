// Cinder Road battle 3 (C3): the roles by function (docs/CAMPAIGN.md, "roles are defined by
// what they achieve"), observed in a run, and the named calls they are checked on. Used by
// cinderRoad3.guard.sim.test.ts, cinderRoad3.march.sim.test.ts and cinderRoad3.rush.sim.test.ts (three
// files so vitest spreads the simulations across workers; see guardrails.testkit.ts).
import { getHex, hexDistance, sameHex } from "../board";
import { GATE_SEEDS } from "../engine/balance";
import { heuristicMuster, rushMuster, type MusterMove, type MusterPolicy } from "../engine/muster";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import { scenarios as intro } from "../engine/scenarios";
import { FAR_BANK_ROADS, NEAR_BANK_ROADS } from "../engine/scenarios/cinderRoad3";
import type { EngineEvent, EngineScenario, EngineState, Orders } from "../engine/types";
import { activeSquads } from "../engine/world";
import { registry } from "../packs/registry";
import { cinderRoad } from "./cinderRoad";
import { ashAndBanner } from "./definition";
import { rollCallMatrix } from "./rollCalls";
import { introCarrySource } from "./rosters";

/** Gate seeds per plan and muster policy (the plans checked here sit far below the floor). */
export const SEEDS = 40;
export const OTR = "open_the_road";
/** The Host's reserve: it wades the Mill Ford for the Mill Road behind the column. */
const RESERVE = ["scorchmark_spears", "kilnbrand_raiders"];
/** The Mill Ford watch's posts (the guard's posts in the intended plan). */
export const WATCH = ["lances", "bows"];
/** Doctrines that leave the Mill Road on the watch's posts: the guard unfilled. */
export const LEAVE = [OTR, "fighting_withdrawal"];
/** Doctrines that never take the far-bank roads on the column's posts: the march unfilled. */
export const STAY = ["shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "bring_the_water"];
/**
 * How the player musters: a harness policy ("none", "heuristic", "rush": every fighting
 * company steps toward the far-bank roads), or "rush the column" (only the companies on Open
 * the Road rush, leaving the watch where it was posted).
 */
export type Muster = MusterPolicy | "rush the column";

/**
 * The share of an unfilled plan's games that may still touch the role by accident; more than
 * this and the plan is misclassified: it is filling the role, not leaving it. Tight without
 * muster and with the heuristic, looser against the rush (as battle 2's role kit).
 */
export function unfilledSlack(muster: Muster): number {
  return muster === "rush" || muster === "rush the column" ? 0.1 : 0.05;
}

interface RoleRun {
  advanced: boolean;
  /**
   * The guard: a Banner company held the Mill Road when the reserve first came up beside it,
   * or fought a reserve company on our bank (east of the river) before any Host company got
   * through. Null if the reserve never reached our bank and nobody got through.
   */
  guard: boolean | null;
  /** The march: a Banner company reached the far-bank roads. */
  march: boolean;
  /** A Host company got through onto the Mill Road behind the column. */
  breached: boolean;
}

function musterFor(state: EngineState, scenario: EngineScenario, orders: Orders, muster: Muster): MusterMove[] {
  if (muster === "heuristic") return heuristicMuster(state, scenario);
  if (muster === "rush") return rushMuster(state, scenario);
  if (muster === "rush the column") return rushMuster(state, scenario, Object.keys(orders).filter((id) => orders[id] === OTR));
  return [];
}

const ourBank = (scenario: EngineScenario, hex: { q: number; r: number } | undefined) => Boolean(hex && hex.q >= 5 && getHex(scenario.board, hex));

function playRoles(scenario: EngineScenario, orders: Orders, seed: number, muster: Muster): RoleRun {
  let state = createInitialState(scenario, { seed, fortune: "on" });
  const millRoad = NEAR_BANK_ROADS[0];
  let held: boolean | null = null;
  let fought = false;
  let through = false;
  let crossed = false;
  let march = false;
  while (state.status === "command") {
    const before = state;
    const result = resolvePhase(state, orders, scenario, { muster: musterFor(state, scenario, orders, muster) });
    for (const event of result.events as EngineEvent[]) {
      if (event.kind === "exit" && FAR_BANK_ROADS.some((road) => sameHex(road, event.hex))) {
        const squad = before.squads.find((item) => item.id === event.squadId);
        if (squad?.faction === "free_banners") march = true;
      }
      if (event.kind === "exit" && RESERVE.concat(["cinderwake_spears", "ashpit_wardens", "chapel_stalkers"]).includes(event.squadId)) through = true;
      if (event.kind === "engagement" && !through) {
        const reserveHex = RESERVE.includes(event.attackerId) ? event.attackerHex : RESERVE.includes(event.defenderId) ? event.defenderHex : undefined;
        if (ourBank(scenario, reserveHex)) fought = true;
      }
    }
    state = result.state;
    const reserve = activeSquads(state).filter((squad) => RESERVE.includes(squad.id));
    if (reserve.some((squad) => ourBank(scenario, squad.hex))) crossed = true;
    if (held === null && reserve.some((squad) => hexDistance(squad.hex, millRoad) <= 1)) {
      held = activeSquads(state).some((squad) => squad.faction === "free_banners" && sameHex(squad.hex, millRoad));
    }
  }
  return {
    advanced: state.status === "victory" || state.status === "stalemate",
    guard: fought || held === true ? true : crossed || through ? false : null,
    march,
    breached: through,
  };
}

/** The plans that leave the guard unfilled on a call: the watch on each leaving doctrine, and the pure march. */
export function unguarded(intended: Orders): [string, Orders][] {
  return [
    ...LEAVE.map((id): [string, Orders] => [`the watch on ${id}`, { ...intended, ...Object.fromEntries(WATCH.map((squadId) => [squadId, id])) }]),
    ["the pure march", Object.fromEntries(Object.keys(intended).map((squadId) => [squadId, OTR]))],
  ];
}

export function rates(scenario: EngineScenario, orders: Orders, muster: Muster, seeds = SEEDS, firstSeed: number = GATE_SEEDS.first) {
  const runs = Array.from({ length: seeds }, (_, index) => playRoles(scenario, orders, firstSeed + index, muster));
  return {
    advance: runs.filter((run) => run.advanced).length / seeds,
    guarded: runs.filter((run) => run.guard === true).length,
    marched: runs.filter((run) => run.march).length,
    breached: runs.filter((run) => run.breached).length,
  };
}

/** Every named call of battle 3 (rollCallMatrix: eight calls, none not applicable). */
export const calls = rollCallMatrix(
  cinderRoad,
  registry.scenarios(),
  cinderRoad.battles.findIndex((battle) => battle.id === "cr_ember_ford"),
  introCarrySource(ashAndBanner, intro, "first_call"),
).calls;
