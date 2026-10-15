// Muster planning (T21): the player's planned moves for a command window, and where a
// company may go given the moves already planned. Pure. Everything is asked of the engine's
// player-view checks (musterOptions, validateMuster); the plan is never resolved here
// (applyMuster runs on the truth and would leak what the player cannot see).
import { hexDistance, sameHex, type HexCoord } from "../../game/board";
import { musterOptions, validateMuster, type EngineScenario, type EngineState, type MusterMove, type MusterProblems } from "../../game/engine";

export type Relief = { squadId: string; relieve: string };
export const isRelief = (move: MusterMove): move is Relief => "relieve" in move;

/** Furthest any company musters (cavalry). */
const MAX_REACH = 2;

/** The plan's move for a company, as the one moving or as the one relieved. */
export function planFor(plan: MusterMove[], squadId: string): MusterMove | undefined {
  return plan.find((move) => move.squadId === squadId || (isRelief(move) && move.relieve === squadId));
}

/** The plan without anything involving `squadId` (its own move, or a relief of it). */
export function withoutPlan(plan: MusterMove[], squadId: string): MusterMove[] {
  return plan.filter((move) => move.squadId !== squadId && !(isRelief(move) && move.relieve === squadId));
}

/**
 * The plan with `move` in it: it replaces the mover's earlier plan (keeping its place, so
 * later moves that count on it still apply after it), or joins at the end. Anything else
 * involving a relieved company is dropped (each company musters or is relieved once).
 */
export function withPlan(plan: MusterMove[], move: MusterMove): MusterMove[] {
  const relieved = isRelief(move) ? move.relieve : null;
  const clashes = (item: MusterMove) =>
    // The mover was itself to be relieved, or the relieved company had plans of its own or another relief.
    (isRelief(item) && item.relieve === move.squadId) ||
    (relieved !== null && item.squadId !== move.squadId && (item.squadId === relieved || (isRelief(item) && item.relieve === relieved)));
  const next = plan.filter((item) => !clashes(item)).map((item) => (item.squadId === move.squadId ? move : item));
  return next.includes(move) ? next : [...next, move];
}

/** What a company may still do this window, given everyone else's planned moves. */
export interface MusterTargets {
  hexes: HexCoord[];
  relieve: string[];
}

/**
 * Where `squadId` may muster and whom it may relieve once the rest of the plan has applied
 * (in order: a hex another company leaves is open to it). Each candidate is checked with
 * validateMuster, the engine's own player-view rule; nothing here resolves on the truth.
 */
export function musterTargets(engine: EngineState, scenario: EngineScenario, plan: MusterMove[], squadId: string): MusterTargets {
  const option = musterOptions(engine, scenario).find((item) => item.squadId === squadId);
  const squad = engine.squads.find((item) => item.id === squadId);
  if (!option || !squad?.hex) return { hexes: [], relieve: [] };
  const others = withoutPlan(plan, squadId);
  const allowed = (move: MusterMove) => validateMuster(engine, scenario, [...others, move])[squadId] === undefined;
  const from = squad.hex;
  const hexes = scenario.board.hexes
    .map((hex) => hex.coord)
    .filter((hex) => !sameHex(hex, from) && hexDistance(hex, from) <= MAX_REACH)
    .filter((hex) => allowed({ squadId, to: hex }));
  const relieve = option.relieve.filter((tired) => allowed({ squadId, relieve: tired }));
  return { hexes, relieve };
}

/** The engine's reasons for any planned move that can no longer be made. */
export function musterProblems(engine: EngineState, scenario: EngineScenario, plan: MusterMove[]): MusterProblems {
  return plan.length ? validateMuster(engine, scenario, plan) : {};
}

/** Companies the plan moves (relieved companies count, as the engine counts them). */
export function musterCount(plan: MusterMove[]): number {
  return plan.reduce((sum, move) => sum + (isRelief(move) ? 2 : 1), 0);
}

/** For drawing: each planned move's start and end hex, from the player's own view. */
export function plannedArrows(
  plan: MusterMove[],
  positions: Map<string, HexCoord>,
): Array<{ squadId: string; from: HexCoord; to: HexCoord; relief: boolean }> {
  const arrows = [];
  for (const move of plan) {
    const from = positions.get(move.squadId);
    const to = isRelief(move) ? positions.get(move.relieve) : move.to;
    if (from && to) arrows.push({ squadId: move.squadId, from, to, relief: isRelief(move) });
  }
  return arrows;
}

