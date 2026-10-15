// The decision side of fog (P4), shared by the fog property test (fogProjection.test.ts) and
// the battles' own fog regressions (cinderRoad3.test.ts): what a Banner company decides must
// not depend on enemies its side cannot see. At every event, for every active Banner company,
// the rule chosen, the target its action resolves to, the route it would take there, where it
// would fall back to, and the offensive conditions (aheadOfLine, atObjective) must be
// identical on the true state and on copies where every unseen enemy is erased or moved
// elsewhere. No vitest import here, so scripts can reuse it.
import { fallBackPlanFor, routeFor } from "./actions";
import type { EngineContext } from "./context";
import { doctrineLibrary } from "./doctrines";
import { chooseRule, evaluateCondition, resolveTarget, type ResolvedTarget } from "./rules";
import { createInitialState, resolvePhase } from "./resolvePhase";
import type { Action, EngineEvent, EngineScenario, EngineState, Orders } from "./types";
import { isActive } from "./world";

const VIEWER = "free_banners" as const;

function targetKey(target: ResolvedTarget | null): string {
  if (!target) return "none";
  if (target.kind === "squad") return `squad:${target.squad.id}`;
  if (target.kind === "objective") return `objective:${target.objective.id}`;
  return `hexes:${target.hexes.map((hex) => `${hex.q},${hex.r}`).join(" ")}`;
}

function selectorOf(action: Action) {
  return action.kind === "advance" ? action.toward : action.kind === "attack" || action.kind === "counterCharge" ? action.target : null;
}

/** Every active Banner company's decision on `state`, one line each. */
export function decisions(state: EngineState, scenario: EngineScenario): string[] {
  const ctx = { state, scenario };
  return state.squads.filter((squad) => squad.faction === VIEWER && isActive(squad) && !squad.noncombatant).map((squad) => {
    const active = squad as Parameters<typeof chooseRule>[1];
    const rule = chooseRule(ctx, active, doctrineLibrary[squad.doctrineId]);
    const selector = rule ? selectorOf(rule.then) : null;
    const offensive = [1, 2, 3].map((by) => evaluateCondition(ctx, active, { kind: "aheadOfLine", by }));
    const target = selector ? resolveTarget(ctx, active, selector) : null;
    // The route it would take there (C5): planned on what it knows, never through what it cannot see.
    const route = target ? routeFor(ctx as unknown as EngineContext, active, target).map((hex) => `${hex.q},${hex.r}`).join(">") : "-";
    // Where it would fall back to, one hex or two (C5): on what it knows, whatever its rule.
    const withdrawals = [1, 2].map((hexes) => fallBackPlanFor(ctx as unknown as EngineContext, active, hexes).map((hex) => `${hex.q},${hex.r}`).join(">"));
    return [
      squad.id,
      rule?.id ?? "none",
      selector ? targetKey(target) : "-",
      route,
      ...withdrawals,
      targetKey(resolveTarget(ctx, active, { kind: "objective", side: "enemy" })),
      evaluateCondition(ctx, active, { kind: "atObjective" }),
      ...offensive,
    ].join("/");
  });
}

/** Copies of `state` with the viewer's unseen enemies erased, and moved to other free hexes. */
export function withoutUnseen(state: EngineState, scenario: EngineScenario, pick: () => number): EngineState[] {
  const intel = state.intel[VIEWER] ?? {};
  const unseen = (id: string, faction: string) => faction !== VIEWER && !intel[id]?.visible;
  const erased = structuredClone(state);
  for (const squad of erased.squads) {
    if (squad.status === "active" && unseen(squad.id, squad.faction)) {
      squad.status = "routed";
      squad.hex = null;
    }
  }
  const moved = structuredClone(state);
  const taken = new Set(moved.squads.filter(isActive).map((squad) => `${squad.hex.q},${squad.hex.r}`));
  moved.objectives.forEach((objective) => taken.add(`${objective.hex.q},${objective.hex.r}`));
  const free = scenario.board.hexes.filter((hex) => hex.terrain !== "wall" && hex.terrain !== "river" && !taken.has(`${hex.coord.q},${hex.coord.r}`));
  for (const squad of moved.squads) {
    if (isActive(squad) && unseen(squad.id, squad.faction) && free.length > 0) {
      const [hex] = free.splice(Math.floor(pick() * free.length), 1);
      squad.hex = { ...hex.coord };
    }
  }
  return [erased, moved];
}

/**
 * Plays `orders` on each seed and, at every rule fired and every move, compares the Banners'
 * decisions on the true state with those on its blind copies. Returns how many comparisons
 * were made and the leaks found (one line per differing comparison).
 */
export function decisionLeaks(scenario: EngineScenario, orders: Orders, seeds: readonly number[], pick: () => number): { checked: number; leaks: string[] } {
  const leaks: string[] = [];
  let checked = 0;
  for (const seed of seeds) {
    let state = createInitialState(scenario, { seed, fortune: "on" });
    const onEmit = (event: EngineEvent, live: EngineState) => {
      if (event.kind !== "ruleFired" && event.kind !== "move") return;
      const truth = decisions(live, scenario);
      for (const blind of withoutUnseen(live, scenario, pick)) {
        checked += 1;
        const view = decisions(blind, scenario);
        if (JSON.stringify(view) !== JSON.stringify(truth)) {
          leaks.push(`${scenario.id}#${seed} phase ${event.phase} beat ${event.beat}: ${truth.filter((line, i) => line !== view[i]).join(", ")} vs ${view.filter((line, i) => line !== truth[i]).join(", ")}`);
        }
      }
    };
    while (state.status === "command") {
      state = resolvePhase(state, orders, scenario, { onEmit }).state;
    }
  }
  return { checked, leaks };
}
