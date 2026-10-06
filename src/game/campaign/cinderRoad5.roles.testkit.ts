// Cinder Road battle 4, the pursuit (CR5): the hunt by function (docs/CAMPAIGN.md, "pursuit
// battles"), observed in a run, and the named calls it is checked on. The role gate
// (cinderRoad5.roleGate.testkit.ts) runs one file per named call
// (cinderRoad5.roles.<call>.sim.test.ts); cinderRoad5.test.ts checks every call has its file.
// No vitest import here, so scripts can reuse these helpers.
import { hexDistance, type HexCoord } from "../board";
import { GATE_SEEDS } from "../engine/balance";
import { heuristicMuster, musterOptions, validateMuster, type MusterMove } from "../engine/muster";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import { scenarios as intro } from "../engine/scenarios";
import { COLUMN, HUNT_POSTS } from "../engine/scenarios/cinderRoad5";
import type { EngineScenario, EngineState, Orders } from "../engine/types";
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
 * How the player musters in the pursuit's gate: no muster, the heuristic, or "close", the
 * interception adversary (the CR5 warden's finding): every company out of contact steps to its
 * legal muster hex nearest a fleeing company it can see, every phase, standing in view of the
 * column and beside its road. It replaces the rush, which has nothing to rush toward here (no
 * enemy objective, no exits for the player; cinderRoad5.test.ts proves it returns no moves).
 */
export type PursuitMuster = "none" | "heuristic" | "close";
export const PURSUIT_MUSTERS: readonly PursuitMuster[] = ["none", "heuristic", "close"];

/** The interception adversary: legal moves only, each checked against the moves already chosen. */
export function closeMuster(state: EngineState, scenario: EngineScenario): MusterMove[] {
  const seen = state.intel[scenario.playerFaction] ?? {};
  const fleeing = state.squads.filter((squad) => COLUMN.includes(squad.id) && squad.status === "active" && squad.hex && seen[squad.id]?.visible).map((squad) => squad.hex as HexCoord);
  if (fleeing.length === 0) return [];
  const distance = (hex: HexCoord) => Math.min(...fleeing.map((target) => hexDistance(target, hex)));
  const moves: MusterMove[] = [];
  for (const option of musterOptions(state, scenario)) {
    const here = state.squads.find((squad) => squad.id === option.squadId)?.hex;
    if (!here || option.hexes.length === 0) continue;
    for (const hex of [...option.hexes].sort((a, b) => distance(a) - distance(b))) {
      if (distance(hex) >= distance(here)) break;
      const next = [...moves, { squadId: option.squadId, to: hex }];
      if (Object.keys(validateMuster(state, scenario, next)).length === 0) {
        moves.push({ squadId: option.squadId, to: hex });
        break;
      }
    }
  }
  return moves;
}

/**
 * The CR5 warden's counterexample (a named regression on every call): everyone on Shield the
 * Line, and in phase 1 the hunt's posts muster beside the road, lances to (4,2), riders to (5,5),
 * bows to (4,6); each move is kept only if it is legal for that call's company.
 */
export const WARDEN_MUSTER: readonly { squadId: string; to: HexCoord }[] = [
  { squadId: "lances", to: { q: 4, r: 2 } },
  { squadId: "riders", to: { q: 5, r: 5 } },
  { squadId: "bows", to: { q: 4, r: 6 } },
];
export function wardenMuster(state: EngineState, scenario: EngineScenario): MusterMove[] {
  if (state.phase !== 1) return [];
  const moves: MusterMove[] = [];
  for (const move of WARDEN_MUSTER) {
    if (Object.keys(validateMuster(state, scenario, [...moves, move])).length === 0) moves.push(move);
  }
  return moves;
}

type Muster = PursuitMuster | "warden";
function musterFor(state: EngineState, scenario: EngineScenario, muster: Muster): MusterMove[] {
  if (muster === "heuristic") return heuristicMuster(state, scenario);
  if (muster === "close") return closeMuster(state, scenario);
  if (muster === "warden") return wardenMuster(state, scenario);
  return [];
}

/** One game to its end under `muster`. */
export function playPursuit(scenario: EngineScenario, orders: Orders, seed: number, muster: Muster): EngineState {
  let state = createInitialState(scenario, { seed, fortune: "on" });
  while (state.status === "command") state = resolvePhase(state, orders, scenario, { muster: musterFor(state, scenario, muster) }).state;
  return state;
}

/**
 * The share of an unfilled plan's games it may win; more than this and the plan is
 * misclassified (it is hunting by accident). Every win breaks three fleeing companies, so a
 * hunt-unfilled plan's win is always a hunt by accident. Tight without muster and with the
 * heuristic, looser against the adversarial musters (as against the rush elsewhere).
 */
export function unfilledSlack(muster: Muster): number {
  return muster === "close" || muster === "warden" ? 0.1 : 0.05;
}

/** Wins, fleeing companies broken and escaped, over `seeds` gate seeds. */
export function rates(scenario: EngineScenario, orders: Orders, muster: Muster, seeds = SEEDS, firstSeed: number = GATE_SEEDS.first) {
  const finals = Array.from({ length: seeds }, (_, index) => playPursuit(scenario, orders, firstSeed + index, muster));
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
