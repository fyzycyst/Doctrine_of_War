// Cinder Road battle 5 (CR6, the finale): the roles by function (docs/CAMPAIGN.md, "roles are
// defined by what they achieve"), observed in a run, and the named calls they are checked on.
// The role gate (cinderRoad6.roleGate.testkit.ts) runs one file per named call
// (cinderRoad6.roles.<call>.sim.test.ts, in `npm run test:campaign`); cinderRoad6.test.ts checks
// every call has its file. No vitest import here, so scripts can reuse these helpers.
import { hexDistance } from "../board";
import { GATE_SEEDS } from "../engine/balance";
import { heuristicMuster, rushMuster, type MusterMove, type MusterPolicy } from "../engine/muster";
import { createInitialState, resolvePhase } from "../engine/resolvePhase";
import { scenarios as intro } from "../engine/scenarios";
import { GREYFORD_GATE } from "../engine/scenarios/cinderRoad6";
import { doctrineLibrary } from "../engine/doctrines";
import type { DoctrineLibrary, EngineEvent, EngineScenario, EngineState, Orders } from "../engine/types";
import { activeSquads } from "../engine/world";
import { registry } from "../packs/registry";
import { cinderRoad } from "./cinderRoad";
import { ashAndBanner } from "./definition";
import { rollCallMatrix } from "./rollCalls";
import { introCarrySource } from "./rosters";
import { canStrikeEnemyObjective, type RoleDeclaration } from "./roles.testkit";

export const BTW = "bring_the_water";
export const RS = "rescue_standard";
/** Where CR6 stands in Cinder Road: the last battle (battle 5), after the pursuit. */
export const CR6_INDEX = cinderRoad.battles.findIndex((battle) => battle.scenarioId === "cinder_road_greyford_gate");

/**
 * The roles, as the battle sheet declares them. The breach: Bring the Water on the march's
 * posts (only it strikes an objective). The banner: Rescue Standard on either banner post
 * (only it rallies); the intended plan carries two, one on either post is an accepted filler.
 */
export const BREACH: RoleDeclaration = { posts: ["north_van", "gate_van", "road_van", "south_van", "lances", "riders", "slingers"], fillers: [BTW] };
export const BANNER: RoleDeclaration = { posts: ["standard", "bows"], fillers: [RS] };

/**
 * The banner role's observable: a rally restores cohesion to an assault company, wherever it
 * stands, observed when the rally fires. An assault company is one whose doctrine in force at
 * that moment (the live state's, so an omitted order's default counts) can strike the gate:
 * Bring the Water, or an editor variant cut from it (variants keep their base's actions). The CR6 warden's finding:
 * the standards keep the assault on its feet on the way in and at the sworn line (most rallies
 * land 3-5 hexes out), rarely at the gate itself. A rally to a company this close to the gate
 * is still counted, separately, as `nearGate`, for the battle sheet; it is not the role.
 */
export const NEAR_GATE = 2;

/**
 * A partial rush: only the companies on these posts rush (`rushMuster` with their ids) every
 * phase; the rest are left to their doctrines. The CR6 warden's adversary: holding the banner
 * posts back lets the strong companies break the sworn line first, then the held-back ones
 * follow as a fresh second wave (docs/CAMPAIGN.md, battle 5).
 */
export interface PartialRush {
  name: string;
  posts: readonly string[];
  /** A timed rush: from this phase on, these posts rush instead. */
  from?: { phase: number; posts: readonly string[] };
}

/** How the player musters: a harness policy, "rush the march" (only the companies on Bring the Water rush), or a partial rush. */
export type Muster = MusterPolicy | "rush the march" | PartialRush;

/** Every post of the finale's call: the march's and the banners'. */
export const ALL_POSTS: readonly string[] = [...BREACH.posts, ...BANNER.posts];
const VANS = ["north_van", "gate_van", "road_van", "south_van"];

const allBut = (...held: string[]): PartialRush => ({ name: `rush all but ${held.join(" and ")}`, posts: ALL_POSTS.filter((post) => !held.includes(post)) });

/**
 * The gate's partial rushes (15): the breach posts only (the warden's: both banner posts held
 * back), the vans only, every post but one (9), and the worst every-post-but-two found in tuning
 * (4: the north flank held back, the warden's signoff4 case, and the riders or lances with
 * another). The sign-off screens every post but two (36) on tuning seeds and promotes the rows at
 * 50% or more to 500 sign-off seeds. A rush that changes its subset
 * from phase to phase is not enumerated.
 */
export const PARTIAL_RUSHES: readonly PartialRush[] = [
  { name: "rush the breach posts only", posts: BREACH.posts },
  { name: "rush the vans only", posts: VANS },
  ...ALL_POSTS.map((held) => allBut(held)),
  allBut("north_van", "riders"),
  allBut("road_van", "riders"),
  allBut("lances", "riders"),
  allBut("north_van", "lances"),
];

/**
 * The CR6 warden's timed rush (signoff5): hold the riders back in phase 1 only, then rush
 * everyone. With the standard on Shield the Line and the bows on Clean Counterstroke it is the
 * worst stock plan the warden found, about 70% on the famous calls (the battle sheet).
 */
export const RIDER_HOLD: PartialRush = { name: "rush all but riders in phase 1, then all", posts: allBut("riders").posts, from: { phase: 2, posts: ALL_POSTS } };

/** Every post but two (36): the census's wider screen. */
export const ALL_BUT_TWO: readonly PartialRush[] = ALL_POSTS.flatMap((first, index) => ALL_POSTS.slice(index + 1).map((second) => allBut(first, second)));

/** A muster's name, for reports. */
export const musterName = (muster: Muster) => (typeof muster === "string" ? muster : muster.name);

function musterFor(state: EngineState, scenario: EngineScenario, orders: Orders, muster: Muster, doctrines: DoctrineLibrary): MusterMove[] {
  if (muster === "heuristic") return heuristicMuster(state, scenario);
  if (muster === "rush") return rushMuster(state, scenario);
  if (muster === "rush the march") return rushMuster(state, scenario, assaultCompanies(state, scenario, orders, doctrines));
  if (typeof muster === "object") return rushMuster(state, scenario, muster.from && state.phase >= muster.from.phase ? muster.from.posts : muster.posts);
  return [];
}

/**
 * The assault companies this phase, by the same predicate as the banner observable: the
 * doctrine the phase puts in force (its order, else the one it already has) can strike the
 * gate, so editor variants of Bring the Water and omitted orders' defaults count.
 */
export function assaultCompanies(state: EngineState, scenario: EngineScenario, orders: Orders, doctrines: DoctrineLibrary = doctrineLibrary): string[] {
  return activeSquads(state)
    .filter((squad) => squad.faction === scenario.playerFaction && isAssaultDoctrine(doctrines, orders[squad.id] ?? squad.doctrineId))
    .map((squad) => squad.id);
}

interface RoleRun {
  advanced: boolean;
  /** The breach: a Banner company struck the gate. */
  breach: boolean;
  /** The banner: a rally restored cohesion to an assault company (on Bring the Water), when it fired. */
  banner: boolean;
  /** Reported, not the role: such a rally to a company within NEAR_GATE of the gate. */
  nearGate: boolean;
}

/** Whether a doctrine is an assault doctrine (it can strike an enemy objective). */
export function isAssaultDoctrine(doctrines: DoctrineLibrary, doctrineId: string): boolean {
  const doctrine = doctrines[doctrineId];
  return Boolean(doctrine && canStrikeEnemyObjective(doctrine));
}

function playRoles(scenario: EngineScenario, orders: Orders, seed: number, muster: Muster, doctrines: DoctrineLibrary): RoleRun {
  let state = createInitialState(scenario, { seed, fortune: "on" });
  let breach = false;
  let banner = false;
  let nearGate = false;
  // Observed at event time (onEmit gives the live state as each event fires), never from the
  // positions at the end of the phase.
  const onEmit = (event: EngineEvent, live: EngineState) => {
    if (event.kind === "objectiveDamage" && event.objectiveId === "greyford_gate") breach = true;
    if (event.kind === "rally" && event.targetId) {
      const target = activeSquads(live).find((squad) => squad.id === event.targetId);
      if (target && target.faction === scenario.playerFaction && isAssaultDoctrine(doctrines, target.doctrineId)) {
        banner = true;
        if (hexDistance(target.hex, GREYFORD_GATE) <= NEAR_GATE) nearGate = true;
      }
    }
  };
  while (state.status === "command") {
    state = resolvePhase(state, orders, scenario, { muster: musterFor(state, scenario, orders, muster, doctrines), onEmit, doctrines }).state;
  }
  return { advanced: state.status === "victory" || state.status === "stalemate", breach, banner, nearGate };
}

/** `doctrines`: the library in play (an editor variant's, via withVariants); default the stock one. */
export function rates(scenario: EngineScenario, orders: Orders, muster: Muster, seeds: number, firstSeed: number = GATE_SEEDS.first, doctrines: DoctrineLibrary = doctrineLibrary) {
  const runs = Array.from({ length: seeds }, (_, index) => playRoles(scenario, orders, firstSeed + index, muster, doctrines));
  return {
    advance: runs.filter((run) => run.advanced).length / seeds,
    breached: runs.filter((run) => run.breach).length,
    bannered: runs.filter((run) => run.banner).length,
    /** Games advanced with a banner's rally on the march (for an unfilled plan: by accident). */
    wonBannered: runs.filter((run) => run.advanced && run.banner).length,
    /** Games with a rally to an assault company within NEAR_GATE of the gate (reported, not the role). */
    nearGate: runs.filter((run) => run.nearGate).length,
    wonNearGate: runs.filter((run) => run.advanced && run.nearGate).length,
  };
}

/** Every named call of the finale (rollCallMatrix: seven calls; the three flex role patterns are not applicable). */
export const matrix = rollCallMatrix(cinderRoad, registry.scenarios(), CR6_INDEX, introCarrySource(ashAndBanner, intro, "first_call"));
export const calls = matrix.calls;
