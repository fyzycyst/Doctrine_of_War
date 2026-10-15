// The player's current aim, for the HUD: staged wins (Hold for Dawn) and escapes (the
// Saltmarsh Column). Built from the authored scenario and the player's view only.
import { winStage, type EngineScenario, type VisibleState } from "../../game/engine";
import { rosterName } from "./view";

export type GoalIcon = "hold" | "break" | "escape";

export interface Goal {
  icon: GoalIcon;
  text: string;
  /** Progress where it can be counted ("1/4"). */
  progress?: string;
}

/** "The Last Gate" → "the Last Gate", for use mid-sentence. */
const inline = (name: string) => name.replace(/^The /, "the ");

const namesOf = (scenario: EngineScenario, ids: string[]) =>
  ids
    .map((id) => {
      const squad = scenario.squads.find((item) => item.id === id);
      return inline(squad ? rosterName(squad) : id);
    })
    .join(" and ");

/** What the player is fighting for in `phase`, or null when the briefing says it all. */
export function goalFor(scenario: EngineScenario, phase: number, view?: VisibleState): Goal | null {
  const win = scenario.winCondition;
  if (win.kind === "holdThenBreak") {
    const objective = scenario.objectives.find((item) => item.id === win.objectiveId);
    return winStage(scenario, phase) === "break"
      ? { icon: "break", text: `Break ${namesOf(scenario, win.squadIds)}` }
      : { icon: "hold", text: `Hold ${inline(objective?.name ?? "the gate")} until dawn` };
  }
  if (win.kind === "escapeEdge" && win.mustEscape?.length) {
    const escaped = view?.squads.filter((squad) => squad.faction === view.viewer && squad.status === "escaped").length ?? 0;
    const others = win.count - win.mustEscape.length;
    return {
      icon: "escape",
      text: `Get ${namesOf(scenario, win.mustEscape)}${others > 0 ? ` and ${others} more` : ""} out`,
      progress: `${escaped}/${win.count}`,
    };
  }
  return null;
}

/** The moment a staged win turns (dawn breaks) at the end of `phase`, or null. */
export function stageTurn(scenario: EngineScenario, phase: number): { title: string; goal: Goal } | null {
  if (winStage(scenario, phase) !== "hold" || winStage(scenario, phase + 1) !== "break") return null;
  const goal = goalFor(scenario, phase + 1);
  return goal ? { title: "Dawn breaks", goal } : null;
}

/** Whether the battle's goal turns with the hour at some phase (Hold for Dawn). */
export function hasStageTurn(scenario: EngineScenario): boolean {
  return Array.from({ length: scenario.maxPhases }, (_, i) => stageTurn(scenario, i + 1)).some(Boolean);
}
