// Cinder Road battle 4, the pursuit (CR5): the hunt by function (docs/CAMPAIGN.md, "pursuit
// battles"), observed in a run, and the named calls it is checked on. The role gate
// (cinderRoad5.roleGate.testkit.ts) runs one file per named call
// (cinderRoad5.roles.<call>.sim.test.ts); cinderRoad5.test.ts checks every call has its file.
// No vitest import here, so scripts can reuse these helpers.
import { GATE_SEEDS, playBattle } from "../engine/balance";
import type { MusterPolicy } from "../engine/muster";
import { scenarios as intro } from "../engine/scenarios";
import { COLUMN, HUNT_POSTS } from "../engine/scenarios/cinderRoad5";
import type { EngineScenario, Orders } from "../engine/types";
import { registry } from "../packs/registry";
import { cinderRoad } from "./cinderRoad";
import { ashAndBanner } from "./definition";
import { rollCallMatrix } from "./rollCalls";
import { introCarrySource } from "./rosters";
import type { RoleDeclaration } from "./roles.testkit";

/** Gate seeds per plan and muster policy (every combination is judged on its own: a census). */
export const SEEDS = 40;
/**
 * The pursuit's one counted role (the pursuit exception). The hunt breaks fleeing companies
 * before they reach the gate: its fillers by function are the doctrines that strike what
 * comes beside them. Clean Counterstroke (intended: it waits, then charges a company fallen
 * out of the column), Bring the Water and Open the Road (each strikes whatever is adjacent,
 * with nothing to march on). Shield the Line and Hold for Dawn stand; Fighting Withdrawal and
 * Rescue Standard give ground: a fleeing company passes all four.
 */
export const HUNT: RoleDeclaration = { posts: HUNT_POSTS, fillers: ["clean_counterstroke", "bring_the_water", "open_the_road"] };

/**
 * The share of an unfilled plan's games it may win; more than this and the plan is
 * misclassified (it is hunting by accident). Every win breaks three fleeing companies, so a
 * hunt-unfilled plan's win is always a hunt by accident. Tight without muster and with the
 * heuristic, looser against the rush.
 */
export function unfilledSlack(muster: MusterPolicy): number {
  return muster === "rush" ? 0.1 : 0.05;
}

/** Wins, fleeing companies broken and escaped, over `seeds` gate seeds. */
export function rates(scenario: EngineScenario, orders: Orders, muster: MusterPolicy, seeds = SEEDS, firstSeed: number = GATE_SEEDS.first) {
  const finals = Array.from({ length: seeds }, (_, index) => playBattle(scenario, orders, firstSeed + index, "on", muster));
  const column = (status: (value: string) => boolean) => finals.reduce((sum, final) => sum + final.squads.filter((squad) => COLUMN.includes(squad.id) && status(squad.status)).length, 0) / seeds;
  return {
    wins: finals.filter((final) => final.status === "victory").length,
    advance: finals.filter((final) => final.status === "victory" || final.status === "stalemate").length / seeds,
    /** Mean fleeing companies broken per game (the hunt's observable). */
    broken: column((status) => status === "routed" || status === "destroyed"),
    /** Mean fleeing companies inside the gate per game. */
    escaped: column((status) => status === "escaped"),
  };
}

/** Every named call of the pursuit (rollCallMatrix: eight calls, none not applicable). */
export const calls = rollCallMatrix(
  cinderRoad,
  registry.scenarios(),
  cinderRoad.battles.findIndex((battle) => battle.id === "cr_gate_road"),
  introCarrySource(ashAndBanner, intro, "first_call"),
).calls;
