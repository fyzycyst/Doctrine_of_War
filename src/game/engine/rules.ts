// Condition evaluation, target selection and first-match rule choice.
import { hexDistance, type HexCoord } from "../board";
import type {
  Condition,
  Doctrine,
  DoctrineRule,
  EngineObjective,
  EngineScenario,
  EngineState,
  TargetSelector,
} from "./types";
import {
  alliesOf,
  byDistance,
  enemiesOf,
  isOverextended,
  type ActiveSquad,
} from "./world";

export interface RuleContext {
  state: EngineState;
  scenario: EngineScenario;
}

export type ResolvedTarget =
  | { kind: "squad"; squad: ActiveSquad }
  | { kind: "objective"; objective: EngineObjective }
  | { kind: "hexes"; hexes: HexCoord[] };

const DEFAULT_OVEREXTENDED_RANGE = 3;
const OBJECTIVE_THREAT_RANGE = 2;

function within(squads: ActiveSquad[], from: HexCoord, range: number): ActiveSquad[] {
  return squads.filter((squad) => hexDistance(squad.hex, from) <= range);
}

function defendedObjectives(ctx: RuleContext, squad: ActiveSquad, objectiveId?: string) {
  return ctx.state.objectives.filter(
    (objective) =>
      objective.defender === squad.faction &&
      objective.integrity > 0 &&
      (objectiveId === undefined || objective.id === objectiveId),
  );
}

export function evaluateCondition(ctx: RuleContext, squad: ActiveSquad, condition: Condition): boolean {
  const enemies = enemiesOf(ctx.state, squad);
  const allies = alliesOf(ctx.state, squad);

  switch (condition.kind) {
    case "always":
      return true;
    case "selfCohesionBelow":
      return squad.cohesion < condition.value;
    case "selfStrengthBelow":
      return squad.strength < condition.value;
    case "enemyAdjacent":
      return within(enemies, squad.hex, 1).length > 0;
    case "enemyWithin":
      return within(enemies, squad.hex, condition.range).length > 0;
    case "enemyBelow":
      return within(enemies, squad.hex, condition.range).some(
        (enemy) => enemy[condition.stat] < condition.value,
      );
    case "allyAdjacentBelow":
      return within(allies, squad.hex, 1).some((ally) => ally[condition.stat] < condition.value);
    case "allyBelow":
      return allies.some((ally) => ally[condition.stat] < condition.value);
    case "enemyOverextended":
      return within(enemies, squad.hex, condition.range ?? DEFAULT_OVEREXTENDED_RANGE).some((enemy) =>
        isOverextended(ctx.state, enemy),
      );
    case "objectiveThreatened":
      return defendedObjectives(ctx, squad, condition.objectiveId).some((objective) =>
        enemies.some((enemy) => hexDistance(enemy.hex, objective.hex) <= OBJECTIVE_THREAT_RANGE),
      );
  }
}

function sortByStat(squads: ActiveSquad[], stat: "cohesion" | "strength", from: HexCoord) {
  const ordered = byDistance(squads, from);
  return ordered
    .map((squad, index) => ({ squad, index }))
    .sort((a, b) => a.squad[stat] - b.squad[stat] || a.index - b.index)
    .map((entry) => entry.squad);
}

/** Returns null when nothing matches the selector (the action is then blocked). */
export function resolveTarget(
  ctx: RuleContext,
  squad: ActiveSquad,
  selector: TargetSelector,
): ResolvedTarget | null {
  const enemies = enemiesOf(ctx.state, squad);
  let chosen: ActiveSquad | undefined;

  switch (selector.kind) {
    case "nearestEnemy":
      chosen = byDistance(enemies, squad.hex)[0];
      break;
    case "weakestEnemy": {
      const pool = selector.range === undefined ? enemies : within(enemies, squad.hex, selector.range);
      chosen = sortByStat(pool, selector.stat, squad.hex)[0];
      break;
    }
    case "overextendedEnemy": {
      const pool = within(enemies, squad.hex, selector.range ?? DEFAULT_OVEREXTENDED_RANGE).filter(
        (enemy) => isOverextended(ctx.state, enemy),
      );
      chosen = byDistance(pool, squad.hex)[0];
      break;
    }
    case "weakestAlly":
      chosen = sortByStat(alliesOf(ctx.state, squad), selector.stat, squad.hex)[0];
      break;
    case "objective": {
      const objective = ctx.state.objectives.find(
        (item) =>
          item.integrity > 0 &&
          (item.defender === squad.faction) === (selector.side === "own") &&
          (selector.objectiveId === undefined || item.id === selector.objectiveId),
      );
      return objective ? { kind: "objective", objective } : null;
    }
    case "exitEdge": {
      const win = ctx.scenario.winCondition;
      return win.kind === "escapeEdge" && squad.faction === ctx.scenario.playerFaction
        ? { kind: "hexes", hexes: win.edgeHexes }
        : null;
    }
  }

  return chosen ? { kind: "squad", squad: chosen } : null;
}

/** First rule whose condition holds, or undefined if none do. */
export function chooseRule(
  ctx: RuleContext,
  squad: ActiveSquad,
  doctrine: Doctrine,
): DoctrineRule | undefined {
  return doctrine.rules.find((rule) => evaluateCondition(ctx, squad, rule.when));
}
