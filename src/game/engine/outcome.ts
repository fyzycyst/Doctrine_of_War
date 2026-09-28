// Win-condition evaluation. Checked after every activation (so a battle can end
// mid-beat) and once more, with `final: true`, after the last beat of maxPhases.
import type { EngineScenario, EngineState } from "./types";

/** Throws on win-condition data that could never be evaluated correctly. */
export function validateWinCondition(scenario: EngineScenario) {
  const win = scenario.winCondition;
  if (win.kind !== "destroySquads") {
    return;
  }
  if (win.squadIds.length === 0) {
    throw new Error(`Scenario ${scenario.id}: destroySquads needs at least one target`);
  }
  for (const id of win.squadIds) {
    const target = scenario.squads.find((squad) => squad.id === id);
    if (!target) {
      throw new Error(`Scenario ${scenario.id}: destroySquads target ${id} does not exist`);
    }
    if (target.faction === scenario.playerFaction) {
      throw new Error(`Scenario ${scenario.id}: destroySquads target ${id} is a player squad`);
    }
  }
}

export interface Outcome {
  status: "victory" | "defeat";
  reason: string;
}

export function evaluateOutcome(state: EngineState, scenario: EngineScenario, final: boolean): Outcome | null {
  const win = scenario.winCondition;
  const playerSquads = state.squads.filter((squad) => squad.faction === scenario.playerFaction);
  const escaped = playerSquads.filter((squad) => squad.status === "escaped").length;
  const active = playerSquads.filter((squad) => squad.status === "active").length;

  switch (win.kind) {
    case "holdObjective": {
      const objective = state.objectives.find((item) => item.id === win.objectiveId);
      if (!objective) {
        throw new Error(`Unknown objective: ${win.objectiveId}`);
      }
      if (objective.integrity <= 0) {
        return { status: "defeat", reason: `${objective.name} has fallen.` };
      }
      break;
    }
    case "escapeEdge":
      if (escaped >= win.count) {
        return { status: "victory", reason: `${escaped} companies escaped the field.` };
      }
      break;
    case "destroySquads": {
      const broken = (id: string) => {
        const squad = state.squads.find((item) => item.id === id);
        return squad !== undefined && (squad.status === "routed" || squad.status === "destroyed");
      };
      if (win.squadIds.length > 0 && win.squadIds.every(broken)) {
        return { status: "victory", reason: "Every marked enemy company is broken." };
      }
      break;
    }
  }

  if (active === 0) {
    return { status: "defeat", reason: "No company is left standing on the field." };
  }

  if (final) {
    return win.kind === "holdObjective"
      ? { status: "victory", reason: "The line held until dawn." }
      : { status: "defeat", reason: "Time ran out before the task was done." };
  }

  return null;
}
