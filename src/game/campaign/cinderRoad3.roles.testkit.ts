// Cinder Road battle 3 (C3): the roles by function (docs/CAMPAIGN.md, "roles are defined by
// what they achieve"), observed in a run, and the named calls they are checked on. The role
// gate (cinderRoad3.roleGate.testkit.ts) runs one file per named call
// (cinderRoad3.roles.<call>.sim.test.ts); cinderRoad3.test.ts checks every call has its file.
// No vitest import here, so scripts can reuse these helpers.
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
import type { RoleDeclaration } from "./roles.testkit";

/** Gate seeds per plan and muster policy (the plans checked here sit far below the floor). */
export const SEEDS = 40;
export const OTR = "open_the_road";
/** The Host's reserve: it wades the Mill Ford for the Mill Road behind the column. */
const RESERVE = ["scorchmark_spears", "kilnbrand_raiders"];
/**
 * The roles, as the battle sheet declares them. The guard keeps the Mill Road: its fillers by
 * orders are the doctrines that stand where they are posted, on the Mill Road or beside it
 * at the Mill Ford (zone of control holds the reserve off the road): Shield the Line
 * (intended), Clean Counterstroke (the tracked alternative: it waits, and strikes the
 * crossers) and Bring the Water (it has nothing to march on, so it stands). Open the Road and
 * Fighting Withdrawal leave for the far-bank roads; Rescue Standard leaves to rally the
 * weakest ally. The march gets companies onto the far-bank roads: only Open the Road marches
 * on them and cuts down the road heads.
 */
export const GUARD: RoleDeclaration = { posts: ["lances", "bows"], fillers: ["shield_the_line", "clean_counterstroke", "bring_the_water"] };
export const MARCH: RoleDeclaration = { posts: ["ford_van", "road_van", "chapel_van", "standard"], fillers: [OTR] };

/**
 * How the player musters: a harness policy ("none", "heuristic", "rush": every fighting
 * company steps toward the far-bank roads), or "rush the column" (only the companies on Open
 * the Road rush, leaving the watch where it was posted).
 */
export type Muster = MusterPolicy | "rush the column";

/**
 * The share of an unfilled plan's games it may WIN with the role filled by accident; more
 * than this and the plan is misclassified: it is winning by filling the role, not without it.
 * Since C5 (routes planned on what the mover knows) a company can meet the reserve on its
 * honest route and still lose, so touching the role is reported, not judged; only winning by
 * it is (as battle 2's role kit). Tight without muster and with the heuristic, looser
 * against the rush.
 */
export function unfilledSlack(muster: Muster): number {
  return muster === "rush" || muster === "rush the column" ? 0.1 : 0.05;
}

interface RoleRun {
  advanced: boolean;
  /**
   * The guard: a Banner company held the Mill Road when the reserve first came up beside it,
   * or fought a reserve company in the crossings or on our bank before any Host company got
   * through. Null if the reserve never reached the crossings and nobody got through.
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

/** Our bank and the crossings (the river column and east of it): a fight with the reserve here keeps it off the road. */
const ourSide = (scenario: EngineScenario, hex: { q: number; r: number } | undefined) => Boolean(hex && hex.q >= 4 && getHex(scenario.board, hex));

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
        if (ourSide(scenario, reserveHex)) fought = true;
      }
    }
    state = result.state;
    const reserve = activeSquads(state).filter((squad) => RESERVE.includes(squad.id));
    if (reserve.some((squad) => ourSide(scenario, squad.hex))) crossed = true;
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

export function rates(scenario: EngineScenario, orders: Orders, muster: Muster, seeds = SEEDS, firstSeed: number = GATE_SEEDS.first) {
  const runs = Array.from({ length: seeds }, (_, index) => playRoles(scenario, orders, firstSeed + index, muster));
  return {
    advance: runs.filter((run) => run.advanced).length / seeds,
    guarded: runs.filter((run) => run.guard === true).length,
    /** Games advanced while the guard's observable says it was filled (by accident, for an unfilled plan). */
    wonGuarded: runs.filter((run) => run.advanced && run.guard === true).length,
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
