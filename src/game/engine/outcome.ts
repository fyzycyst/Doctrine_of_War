// Win-condition evaluation. Checked after every activation (so a battle can end
// mid-beat) and once more, with `final: true`, after the last beat of maxPhases.
import type { HexCoord } from "../board";
import type { BattleOutcome, EngineScenario, EngineState, FactionId } from "./types";

/**
 * The hexes through which `faction` may leave the board: the player's escape edge,
 * or, for the opposing side, the edge of an `enemyEscape` defeat condition.
 */
export function exitHexesFor(scenario: EngineScenario, faction: FactionId): HexCoord[] | null {
  if (faction === scenario.playerFaction) {
    return scenario.winCondition.kind === "escapeEdge" ? scenario.winCondition.edgeHexes : null;
  }
  const escape = scenario.defeatConditions?.find((condition) => condition.kind === "enemyEscape");
  return escape?.kind === "enemyEscape" ? escape.edgeHexes : null;
}

/** Throws on win/defeat-condition data that could never be evaluated correctly. */
export function validateWinCondition(scenario: EngineScenario) {
  for (const condition of scenario.defeatConditions ?? []) {
    if (condition.count < 1 || (condition.kind === "enemyEscape" && condition.edgeHexes.length === 0)) {
      throw new Error(`Scenario ${scenario.id}: invalid ${condition.kind} defeat condition`);
    }
  }
  for (const squad of scenario.squads.filter((item) => item.noncombatant)) {
    if (squad.faction !== scenario.playerFaction) {
      throw new Error(`Scenario ${scenario.id}: noncombatant ${squad.id} must be a player squad`);
    }
  }
  if (scenario.winCondition.kind === "escapeEdge") {
    for (const id of scenario.winCondition.mustEscape ?? []) {
      const squad = scenario.squads.find((item) => item.id === id);
      if (!squad || squad.faction !== scenario.playerFaction) {
        throw new Error(`Scenario ${scenario.id}: mustEscape squad ${id} must be a player squad`);
      }
    }
  }
  if (scenario.winCondition.kind === "holdThenBreak") {
    const stages = scenario.winCondition;
    const objective = scenario.objectives.find((item) => item.id === stages.objectiveId);
    if (!objective || objective.defender !== scenario.playerFaction) {
      throw new Error(`Scenario ${scenario.id}: holdThenBreak needs a player-defended objective ${stages.objectiveId}`);
    }
    if (!Number.isInteger(stages.dawnPhase) || stages.dawnPhase < 1 || stages.dawnPhase > scenario.maxPhases) {
      throw new Error(`Scenario ${scenario.id}: holdThenBreak dawnPhase must be 1..${scenario.maxPhases}`);
    }
    for (const id of stages.squadIds) {
      const target = scenario.squads.find((squad) => squad.id === id);
      if (!target || target.faction === scenario.playerFaction) {
        throw new Error(`Scenario ${scenario.id}: holdThenBreak target ${id} must be an enemy squad`);
      }
    }
    if (stages.squadIds.length === 0 || (stages.count !== undefined && (stages.count < 1 || stages.count > stages.squadIds.length))) {
      throw new Error(`Scenario ${scenario.id}: holdThenBreak needs 1..${stages.squadIds.length} targets`);
    }
  }
  const win = scenario.winCondition;
  if (win.kind !== "destroySquads") {
    return;
  }
  if (win.count !== undefined && (!Number.isInteger(win.count) || win.count < 1 || win.count > win.squadIds.length)) {
    throw new Error(`Scenario ${scenario.id}: destroySquads count must be 1..${win.squadIds.length}`);
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

/**
 * Which stage a staged battle is in for the phase being fought: "hold" before dawn,
 * "break" from dawn on; null for single-stage win conditions.
 */
export function winStage(scenario: EngineScenario, phase: number): "hold" | "break" | null {
  const win = scenario.winCondition;
  return win.kind === "holdThenBreak" ? (phase >= win.dawnPhase ? "break" : "hold") : null;
}

export interface Outcome {
  status: BattleOutcome;
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
    case "escapeEdge": {
      const must = (win.mustEscape ?? []).map((id) => state.squads.find((squad) => squad.id === id));
      const lost = must.find((squad) => squad && (squad.status === "routed" || squad.status === "destroyed"));
      if (lost) {
        return { status: "defeat", reason: `${lost.name} was lost.` };
      }
      if (escaped >= win.count && must.every((squad) => squad?.status === "escaped")) {
        return { status: "victory", reason: `${escaped} companies escaped the field.` };
      }
      break;
    }
    case "holdThenBreak": {
      const objective = state.objectives.find((item) => item.id === win.objectiveId);
      if (!objective) {
        throw new Error(`Unknown objective: ${win.objectiveId}`);
      }
      if (objective.integrity <= 0) {
        return { status: "defeat", reason: `${objective.name} has fallen.` };
      }
      const broken = win.squadIds.filter((id) => {
        const squad = state.squads.find((item) => item.id === id);
        return squad !== undefined && (squad.status === "routed" || squad.status === "destroyed");
      }).length;
      if (state.phase >= win.dawnPhase && broken >= (win.count ?? win.squadIds.length)) {
        return { status: "victory", reason: `Dawn: ${objective.name} held, and the siege is broken.` };
      }
      break;
    }
    case "destroySquads": {
      const broken = (id: string) => {
        const squad = state.squads.find((item) => item.id === id);
        return squad !== undefined && (squad.status === "routed" || squad.status === "destroyed");
      };
      const needed = win.count ?? win.squadIds.length;
      if (win.squadIds.length > 0 && win.squadIds.filter(broken).length >= needed) {
        return { status: "victory", reason: "Every marked enemy company is broken." };
      }
      break;
    }
  }

  for (const condition of scenario.defeatConditions ?? []) {
    if (condition.kind === "enemyEscape") {
      const through = state.squads.filter(
        (squad) => squad.faction !== scenario.playerFaction && squad.status === "escaped",
      ).length;
      if (through >= condition.count) {
        return { status: "defeat", reason: `${through} enemy companies broke through behind the line.` };
      }
    } else {
      const lost = playerSquads.filter(
        (squad) => !squad.noncombatant && (squad.status === "routed" || squad.status === "destroyed"),
      ).length;
      if (lost >= condition.count) {
        return { status: "defeat", reason: `The line broke: ${lost} companies are lost.` };
      }
    }
  }

  if (active === 0) {
    return { status: "defeat", reason: "No company is left standing on the field." };
  }

  if (final) {
    if (win.kind === "holdObjective") {
      return { status: "victory", reason: "The line held until dawn." };
    }
    if (scenario.timeoutOutcome === "stalemate" && win.kind === "escapeEdge") {
      // Everything that had to be saved got out, and all but one of the companies needed: a stalemate.
      const must = win.mustEscape ?? [];
      const saved =
        must.every((id) => state.squads.find((squad) => squad.id === id)?.status === "escaped") && escaped >= win.count - 1;
      return saved
        ? { status: "stalemate", reason: "The column is safe, but one company too few got out with it." }
        : { status: "defeat", reason: "Night fell with the column still in the marsh." };
    }
    if (scenario.timeoutOutcome === "stalemate") {
      const needed = scenario.stalemateRequires;
      const targets = needed?.targetsOnly && (win.kind === "destroySquads" || win.kind === "holdThenBreak") ? win.squadIds : null;
      const broken = state.squads.filter(
        (squad) =>
          squad.faction !== scenario.playerFaction &&
          (squad.status === "routed" || squad.status === "destroyed") &&
          (targets === null || targets.includes(squad.id)),
      ).length;
      if (!needed || broken >= needed.minEnemyBroken) {
        return {
          status: "stalemate",
          reason:
            win.kind === "holdThenBreak"
              ? "The wall held until dawn, but the siege was not broken."
              : "Neither side broke: the Host did not get through, and its vanguard still stands.",
        };
      }
      return { status: "defeat", reason: "Time ran out and the enemy was never truly tested." };
    }
    return {
      status: "defeat",
      reason: win.kind === "holdThenBreak" ? "The wall held until dawn, but the siege was not broken." : "Time ran out before the task was done.",
    };
  }

  return null;
}
