// resolvePhase v2: (state, orders, scenario, options) -> { state, events, report }.
// Pure: the input state is never mutated, and the same inputs always produce the
// same result. The seeded rng lives in state (rngState) and is returned advanced.
// See docs/ENGINE.md for the beat model.
import { sameHex } from "../board";
import { executeAction } from "./actions";
import type { EngineContext, EventBody } from "./context";
import { doctrineLibrary } from "./doctrines";
import { dreadFromSight, eventsFor, observeDeparture, refreshIntel, timeOfDayAt, witnessEvent } from "./fog";
import { phaseStartWeather, stressCheck } from "./fortune";
import { evaluateOutcome, exitHexesFor, validateWinCondition } from "./outcome";
import { buildReport } from "./report";
import { createRng } from "./rng";
import { chooseRule } from "./rules";
import type {
  DoctrineLibrary,
  EngineEvent,
  EngineScenario,
  EngineSquad,
  EngineState,
  FactionId,
  FortuneMode,
  Orders,
  PhaseResult,
} from "./types";
import { getSquad, isActive } from "./world";

export const BEATS_PER_PHASE = 3;

export interface BattleOptions {
  /** Seed for every chance roll in the battle. Default 1. */
  seed?: number;
  /** Friction & fortune (chance, weather shifts, fog, dread). Default "off": deterministic and omniscient. */
  fortune?: FortuneMode;
}

export interface ResolveOptions {
  /** Doctrine lookup; defaults to the built-in library. The future editor passes its own. */
  doctrines?: DoctrineLibrary;
  /**
   * Debug/capture hook: called with each raw event and the live state at the moment it
   * is emitted. Must not mutate anything. Used by the fog property tests.
   */
  onEmit?: (event: EngineEvent, state: EngineState) => void;
}

export function createInitialState(scenario: EngineScenario, options: BattleOptions = {}): EngineState {
  validateWinCondition(scenario);
  const seed = (options.seed ?? 1) >>> 0;
  const state: EngineState = {
    scenarioId: scenario.id,
    phase: 1,
    maxPhases: scenario.maxPhases,
    status: "command",
    squads: scenario.squads.map((squad) => ({
      id: squad.id,
      name: squad.name,
      faction: squad.faction,
      role: squad.role,
      hex: { ...squad.hex },
      strength: squad.strength,
      cohesion: squad.cohesion,
      resolve: squad.resolve,
      doctrineId: squad.doctrineId,
      status: "active",
      braced: false,
      surging: false,
      ...(squad.renown ? { renown: { ...squad.renown } } : {}),
      ...(squad.noncombatant ? { noncombatant: true } : {}),
    })),
    objectives: scenario.objectives.map((objective) => ({
      id: objective.id,
      name: objective.name,
      hex: { ...objective.hex },
      integrity: objective.integrity,
      defender: objective.defender,
    })),
    contacts: [],
    fortune: options.fortune ?? "off",
    seed,
    rngState: seed,
    weather: scenario.forecast?.start ?? "clear",
    timeOfDay: timeOfDayAt(scenario, 1),
    intel: {},
    dreaded: [],
  };
  // Opening sightings, so the first command window already has fog applied.
  refreshIntel({ state, scenario });
  return state;
}

/**
 * Whether the player may give `squadId` this doctrine: anything in the scenario's
 * playerDoctrineIds, or the squad's own scenario-default doctrine (always legal to
 * resend, even if a scenario leaves it off the list).
 */
export function isOrderAllowed(scenario: EngineScenario, squadId: string, doctrineId: string): boolean {
  const squad = scenario.squads.find((item) => item.id === squadId);
  return Boolean(
    squad &&
      squad.faction === scenario.playerFaction &&
      !squad.noncombatant &&
      (scenario.playerDoctrineIds.includes(doctrineId) || squad.doctrineId === doctrineId),
  );
}

function assign(
  state: EngineState,
  doctrines: DoctrineLibrary,
  orders: Orders,
  faction: FactionId,
  source: string,
  allowed?: (squadId: string, doctrineId: string) => boolean,
) {
  for (const [squadId, doctrineId] of Object.entries(orders)) {
    const squad = state.squads.find((item) => item.id === squadId);
    const doctrine = doctrines[doctrineId];
    if (!squad || !doctrine || squad.faction !== faction || doctrine.faction !== faction) {
      throw new Error(`Invalid ${source} order: ${squadId} -> ${doctrineId}`);
    }
    if (allowed && !allowed(squadId, doctrineId)) {
      throw new Error(`Invalid ${source} order: ${doctrineId} is not available in this scenario`);
    }
    squad.doctrineId = doctrineId;
  }
}

function opponentOf(scenario: EngineScenario, faction: FactionId): FactionId {
  const other = scenario.squads.find((squad) => squad.faction !== faction);
  if (!other) {
    throw new Error(`Scenario ${scenario.id} has only one side`);
  }
  return other.faction;
}

/**
 * After anything that moves or removes squads: update fog, then dread from new
 * sightings. Dread can rout an observer, which changes what its side sees, so
 * refresh again until nothing more routs (each dread pair fires once, so this ends).
 */
function afterChange(ctx: EngineContext) {
  refreshIntel(ctx, ctx.emit, ctx.beat, ctx.phase);
  while (dreadFromSight(ctx)) {
    refreshIntel(ctx, ctx.emit, ctx.beat, ctx.phase);
  }
}

export function resolvePhase(
  input: EngineState,
  orders: Orders,
  scenario: EngineScenario,
  options: ResolveOptions = {},
): PhaseResult {
  const doctrines = options.doctrines ?? doctrineLibrary;

  if (input.status !== "command") {
    throw new Error(`Battle ${input.scenarioId} is already over (${input.status})`);
  }

  const state = structuredClone(input);
  const phase = state.phase;
  const hostPhase = scenario.hostSchedule.find((entry) => entry.phase === phase);

  if (hostPhase) {
    assign(state, doctrines, hostPhase.orders, opponentOf(scenario, scenario.playerFaction), "host schedule");
  }
  // Player orders must come from the scenario's doctrine list; starting doctrines are exempt.
  assign(state, doctrines, orders, scenario.playerFaction, "player", (squadId, doctrineId) =>
    isOrderAllowed(scenario, squadId, doctrineId),
  );

  const events: EngineEvent[] = [];
  const rng = createRng(state.rngState);
  const ctx: EngineContext = {
    state,
    scenario,
    doctrines,
    rng,
    phase,
    beat: 0,
    // Events are deep-copied so playback data never aliases state or scenario coordinates.
    emit: (event: EventBody) => {
      const witness = witnessEvent(ctx, event);
      const stamped = { ...structuredClone(event), phase, beat: ctx.beat, ...witness } as EngineEvent;
      events.push(stamped);
      options.onEmit?.(stamped, state);
      if (event.kind === "rout" || event.kind === "exit") {
        const status = event.kind === "exit" ? "escaped" : event.cause === "strength" ? "destroyed" : "routed";
        observeDeparture(ctx, getSquad(state, event.squadId), event.hex, status);
      }
    },
  };

  // Phase start (beat 0): the hour, weather, then sightings and dread at the new positions.
  state.timeOfDay = timeOfDayAt(scenario, phase);
  phaseStartWeather(ctx);
  afterChange(ctx);

  const sides: FactionId[] = [scenario.initiativeSide, opponentOf(scenario, scenario.initiativeSide)];
  let outcome = evaluateOutcome(state, scenario, false);

  battle: for (let beat = 1; beat <= BEATS_PER_PHASE && !outcome; beat += 1) {
    ctx.beat = beat;
    for (const side of sides) {
      // Activation order within a side = scenario squad list order.
      for (const squad of state.squads) {
        if (squad.faction !== side || !isActive(squad)) {
          continue;
        }

        squad.braced = false;
        squad.surging = false;
        const doctrine = doctrines[squad.doctrineId];
        const chosen = chooseRule(ctx, squad, doctrine);

        if (!chosen) {
          ctx.emit({ kind: "blocked", squadId: squad.id, reason: "no standing order applies" });
        } else {
          const rule = stressCheck(ctx, squad, chosen);
          if (rule) {
            ctx.emit({
              kind: "ruleFired",
              squadId: squad.id,
              doctrineId: doctrine.id,
              ruleId: rule.id,
              label: rule.label,
            });
            executeAction(ctx, squad, rule.then);
          }
        }

        exitIfOnEdge(ctx, squad);
        afterChange(ctx);

        outcome = evaluateOutcome(state, scenario, false);
        if (outcome) {
          break battle;
        }
      }
    }
  }

  if (!outcome) {
    ctx.beat = 0;
    if (phase >= state.maxPhases) {
      outcome = evaluateOutcome(state, scenario, true);
    } else {
      state.phase = phase + 1;
      // The hour turns with the phase, so the next command window sees by the next hour.
      const hour = state.timeOfDay;
      state.timeOfDay = timeOfDayAt(scenario, state.phase);
      if (state.timeOfDay !== hour) {
        // New light: sightings (and any first-sight dread) land now, in this phase's
        // closing events, so the command window's intel matches what can be seen.
        const standing = state.squads.filter(isActive).length;
        afterChange(ctx);
        // Only a rout from dread can change the outcome here; otherwise the next phase's
        // start decides, as before.
        if (state.squads.filter(isActive).length < standing) {
          outcome = evaluateOutcome(state, scenario, false);
        }
      }
    }
  }
  if (outcome) {
    state.status = outcome.status;
    ctx.emit({ kind: "outcome", status: outcome.status, reason: outcome.reason });
  }

  state.rngState = rng.state;
  const intent = hostPhase?.intent ?? "The armies clash.";
  // The report is the player's account: only what the player's side witnessed.
  const report = buildReport(phase, intent, eventsFor(events, scenario.playerFaction), state);
  return { state, events, report };
}

/** A squad standing on one of its side's exit hexes after its activation leaves the board. */
function exitIfOnEdge(ctx: EngineContext, squad: EngineSquad) {
  const exits = exitHexesFor(ctx.scenario, squad.faction);
  const hex = squad.hex;
  if (!exits || squad.status !== "active" || !hex || !exits.some((edge) => sameHex(edge, hex))) {
    return;
  }
  ctx.emit({ kind: "exit", squadId: squad.id, hex });
  squad.status = "escaped";
  squad.hex = null;
  squad.braced = false;
  squad.surging = false;
}
