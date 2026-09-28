// resolvePhase v2: (state, orders, scenario, rng, options) -> { state, events, report }.
// Pure: the input state is never mutated, and the same inputs (including the rng
// state) always produce the same result. See docs/ENGINE.md for the beat model.
import { sameHex } from "../board";
import { executeAction, type ActionContext, type EventBody } from "./actions";
import { doctrineLibrary } from "./doctrines";
import { phaseStartWeather, stressCheck, type FortuneContext, type FortuneMode } from "./fortune";
import { evaluateOutcome } from "./outcome";
import { buildReport } from "./report";
import type { Rng } from "./rng";
import { chooseRule } from "./rules";
import type {
  DoctrineLibrary,
  EngineEvent,
  EngineScenario,
  EngineSquad,
  EngineState,
  FactionId,
  Orders,
  PhaseResult,
} from "./types";
import { isActive } from "./world";

export const BEATS_PER_PHASE = 3;

export interface ResolveOptions {
  /** Chance systems (T04). Default "off": fully deterministic, rng untouched. */
  fortune?: FortuneMode;
  /** Doctrine lookup; defaults to the built-in library. The future editor passes its own. */
  doctrines?: DoctrineLibrary;
}

export function createInitialState(scenario: EngineScenario): EngineState {
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
    })),
    objectives: scenario.objectives.map((objective) => ({
      id: objective.id,
      name: objective.name,
      hex: { ...objective.hex },
      integrity: objective.integrity,
      defender: objective.defender,
    })),
    contacts: [],
  };
  return state;
}

function cloneState(state: EngineState): EngineState {
  return {
    ...state,
    squads: state.squads.map((squad) => ({ ...squad, hex: squad.hex ? { ...squad.hex } : null })),
    objectives: state.objectives.map((objective) => ({ ...objective, hex: { ...objective.hex } })),
    contacts: [...state.contacts],
  };
}

function assign(
  state: EngineState,
  doctrines: DoctrineLibrary,
  orders: Orders,
  faction: FactionId,
  source: string,
) {
  for (const [squadId, doctrineId] of Object.entries(orders)) {
    const squad = state.squads.find((item) => item.id === squadId);
    const doctrine = doctrines[doctrineId];
    if (!squad || !doctrine || squad.faction !== faction || doctrine.faction !== faction) {
      throw new Error(`Invalid ${source} order: ${squadId} -> ${doctrineId}`);
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

export function resolvePhase(
  input: EngineState,
  orders: Orders,
  scenario: EngineScenario,
  rng: Rng,
  options: ResolveOptions = {},
): PhaseResult {
  const doctrines = options.doctrines ?? doctrineLibrary;
  const fortuneMode = options.fortune ?? "off";

  if (input.status !== "command") {
    throw new Error(`Battle ${input.scenarioId} is already over (${input.status})`);
  }

  const state = cloneState(input);
  const phase = state.phase;
  const hostPhase = scenario.hostSchedule.find((entry) => entry.phase === phase);
  const hostFaction = opponentOf(scenario, scenario.playerFaction);

  if (hostPhase) {
    assign(state, doctrines, hostPhase.orders, hostFaction, "host schedule");
  }
  assign(state, doctrines, orders, scenario.playerFaction, "player");

  const events: EngineEvent[] = [];
  let beat = 0;
  const emit = (event: EventBody) => {
    events.push({ ...event, phase, beat } as EngineEvent);
  };
  const fortune: FortuneContext = { state, scenario, options: { fortune: fortuneMode }, rng, phase, beat };
  const ctx: ActionContext = { state, scenario, doctrines, fortune, emit };

  const finish = (outcome: { status: "victory" | "defeat"; reason: string }) => {
    state.status = outcome.status;
    emit({ kind: "outcome", status: outcome.status, reason: outcome.reason });
  };

  events.push(...phaseStartWeather(fortune));

  const sides: FactionId[] = [scenario.initiativeSide, opponentOf(scenario, scenario.initiativeSide)];

  battle: for (beat = 1; beat <= BEATS_PER_PHASE; beat += 1) {
    fortune.beat = beat;
    for (const side of sides) {
      // Activation order within a side = scenario squad list order.
      for (const squad of state.squads) {
        if (squad.faction !== side || !isActive(squad)) {
          continue;
        }

        squad.braced = false;
        const doctrine = doctrines[squad.doctrineId];
        const chosen = chooseRule(ctx, squad, doctrine);

        if (!chosen) {
          emit({ kind: "blocked", squadId: squad.id, reason: "no standing order applies" });
        } else {
          const checked = stressCheck(fortune, squad, chosen);
          events.push(...checked.events);
          if (checked.rule) {
            emit({
              kind: "ruleFired",
              squadId: squad.id,
              doctrineId: doctrine.id,
              ruleId: checked.rule.id,
              label: checked.rule.label,
            });
            executeAction(ctx, squad, checked.rule.then);
          }
        }

        exitIfOnEdge(ctx, squad);

        const outcome = evaluateOutcome(state, scenario, false);
        if (outcome) {
          finish(outcome);
          break battle;
        }
      }
    }
  }

  if (state.status === "command") {
    beat = 0;
    if (phase >= state.maxPhases) {
      finish(evaluateOutcome(state, scenario, true)!);
    } else {
      state.phase = phase + 1;
    }
  }

  const title = `Phase ${phase}: ${hostPhase?.intent ?? "The armies clash."}`;
  return { state, events, report: buildReport(phase, title, events, state) };
}

/** A player squad standing on an escape-edge hex after its activation leaves the board. */
function exitIfOnEdge(ctx: ActionContext, squad: EngineSquad) {
  const win = ctx.scenario.winCondition;
  const hex = squad.hex;
  if (
    win.kind !== "escapeEdge" ||
    squad.faction !== ctx.scenario.playerFaction ||
    squad.status !== "active" ||
    !hex ||
    !win.edgeHexes.some((edge) => sameHex(edge, hex))
  ) {
    return;
  }
  ctx.emit({ kind: "exit", squadId: squad.id, hex });
  squad.status = "escaped";
  squad.hex = null;
  squad.braced = false;
}
