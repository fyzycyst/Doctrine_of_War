// Cinder Road battle 6 (CR6, the finale): the roles by function (docs/CAMPAIGN.md, "roles are
// defined by what they achieve"), observed in a run, and the named calls they are checked on.
// The role gate (cinderRoad6.roleGate.testkit.ts) runs one file per named call
// (cinderRoad6.roles.<call>.sim.test.ts, in `npm run test:finale`); cinderRoad6.test.ts checks
// every call has its file. No vitest import here, so scripts can reuse these helpers.
import { hexDistance } from "../board";
import { GATE_SEEDS } from "../engine/balance";
import { heuristicMuster, rushMuster, type MusterMove, type MusterPolicy } from "../engine/muster";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import { scenarios as intro } from "../engine/scenarios";
import { GREYFORD_GATE } from "../engine/scenarios/cinderRoad6";
import type { EngineEvent, EngineScenario, EngineState, Orders } from "../engine/types";
import { activeSquads } from "../engine/world";
import { registry } from "../packs/registry";
import { cinderRoad } from "./cinderRoad";
import { ashAndBanner } from "./definition";
import { rollCallMatrix } from "./rollCalls";
import { introCarrySource } from "./rosters";
import type { RoleDeclaration } from "./roles.testkit";

export const BTW = "bring_the_water";
export const RS = "rescue_standard";
/** Where CR6 stands in Cinder Road for now: after battle 3 (moved to slot 6 when battles 4 and 5 land). */
export const CR6_INDEX = cinderRoad.battles.findIndex((battle) => battle.scenarioId === "cinder_road_greyford_gate");

/**
 * The roles, as the battle sheet declares them. The breach: Bring the Water on the march's
 * posts (only it strikes an objective). The banner: Rescue Standard on either banner post
 * (only it rallies); the intended plan carries two, one is an accepted filler.
 */
export const BREACH: RoleDeclaration = { posts: ["north_van", "gate_van", "road_van", "south_van", "lances", "riders", "slingers"], fillers: [BTW] };
export const BANNER: RoleDeclaration = { posts: ["standard", "bows"], fillers: [RS] };

/** A rally counts for the banner role when its target stands this close to the gate. */
export const BANNER_REACH = 2;

/** How the player musters: a harness policy, or "rush the march" (only the companies on Bring the Water rush). */
export type Muster = MusterPolicy | "rush the march";

function musterFor(state: EngineState, scenario: EngineScenario, orders: Orders, muster: Muster): MusterMove[] {
  if (muster === "heuristic") return heuristicMuster(state, scenario);
  if (muster === "rush") return rushMuster(state, scenario);
  if (muster === "rush the march") return rushMuster(state, scenario, Object.keys(orders).filter((id) => orders[id] === BTW));
  return [];
}

interface RoleRun {
  advanced: boolean;
  /** The breach: a Banner company struck the gate. */
  breach: boolean;
  /** The banner: a rally restored cohesion to a company within BANNER_REACH of the gate. */
  banner: boolean;
}

function playRoles(scenario: EngineScenario, orders: Orders, seed: number, muster: Muster): RoleRun {
  let state = createInitialState(scenario, { seed, fortune: "on" });
  let breach = false;
  let banner = false;
  while (state.status === "command") {
    const result = resolvePhase(state, orders, scenario, { muster: musterFor(state, scenario, orders, muster) });
    const after = new Map(activeSquads(result.state).map((squad) => [squad.id, squad.hex]));
    for (const event of result.events as EngineEvent[]) {
      if (event.kind === "objectiveDamage" && event.objectiveId === "greyford_gate") breach = true;
      if (event.kind === "rally" && event.targetId) {
        const hex = after.get(event.targetId);
        if (hex && hexDistance(hex, GREYFORD_GATE) <= BANNER_REACH) banner = true;
      }
    }
    state = result.state;
  }
  return { advanced: state.status === "victory" || state.status === "stalemate", breach, banner };
}

export function rates(scenario: EngineScenario, orders: Orders, muster: Muster, seeds: number, firstSeed: number = GATE_SEEDS.first) {
  const runs = Array.from({ length: seeds }, (_, index) => playRoles(scenario, orders, firstSeed + index, muster));
  return {
    advance: runs.filter((run) => run.advanced).length / seeds,
    breached: runs.filter((run) => run.breach).length,
    bannered: runs.filter((run) => run.banner).length,
    /** Games advanced with a banner's rally near the gate (for an unfilled plan: by accident). */
    wonBannered: runs.filter((run) => run.advanced && run.banner).length,
  };
}

/** Every named call of the finale (rollCallMatrix: seven calls; the three flex role patterns are not applicable). */
export const matrix = rollCallMatrix(cinderRoad, registry.scenarios(), CR6_INDEX, introCarrySource(ashAndBanner, intro, "first_call"));
export const calls = matrix.calls;
