// Win-condition evaluation. Checked after every activation (so a battle can end
// mid-beat) and once more, with `final: true`, after the last beat of maxPhases.
import type { EngineScenario, EngineState } from "./types";

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
      const targets = state.squads.filter((squad) => win.squadIds.includes(squad.id));
      if (targets.every((squad) => squad.status === "routed" || squad.status === "destroyed")) {
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
