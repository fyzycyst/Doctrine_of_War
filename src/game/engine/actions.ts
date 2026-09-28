// Action execution and combat math. Mutates the working copy of state that
// resolvePhase owns, and reports everything that happened through `emit`.
import { boardNeighbors, getHex, hexDistance, terrainDefenseBonus, type HexCoord } from "../board";
import { firstContact, type FortuneContext } from "./fortune";
import { planAdvance, planFallBack } from "./movement";
import { resolveTarget, type ResolvedTarget, type RuleContext } from "./rules";
import type { Action, DoctrineLibrary, DoctrinePassives, EngineEvent, EngineSquad } from "./types";
import { adjacentEnemies, alliesOf, speedOf, type ActiveSquad } from "./world";

/** An event without its phase/beat stamp; resolvePhase adds those. */
export type EventBody<E = EngineEvent> = E extends EngineEvent ? Omit<E, "phase" | "beat"> : never;

export interface ActionContext extends RuleContext {
  doctrines: DoctrineLibrary;
  fortune: FortuneContext;
  emit: (event: EventBody) => void;
}

// Tuning constants. Kept together so the balance harness (T04+) can find them.
export const BRACE_DEFENSE = 3;
export const BRACE_RIPOSTE = 2;
export const CHARGE_BONUS = 2;
export const SIEGE_OBJECTIVE_DAMAGE = 30;
export const BASE_OBJECTIVE_DAMAGE = 10;
export const RALLY_BASE = 6;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function passivesOf(ctx: ActionContext, squad: EngineSquad): DoctrinePassives {
  return ctx.doctrines[squad.doctrineId].passives;
}

function terrainBonus(ctx: ActionContext, hex: HexCoord): number {
  const boardHex = getHex(ctx.scenario.board, hex);
  return boardHex ? terrainDefenseBonus(boardHex.terrain) : 0;
}

export interface EngagementLosses {
  defenderStrength: number;
  defenderCohesion: number;
  attackerStrength: number;
  attackerCohesion: number;
}

/** Pure combat math: losses (positive numbers) for one strike and its riposte. */
export function engagementLosses(
  ctx: ActionContext,
  attacker: ActiveSquad,
  defender: ActiveSquad,
  charge: boolean,
): EngagementLosses {
  const atkPassives = passivesOf(ctx, attacker);
  const defPassives = passivesOf(ctx, defender);
  const attack =
    attacker.strength / 10 + attacker.resolve * 1.5 + (charge ? CHARGE_BONUS + atkPassives.counter : 0);
  const defense =
    defender.cohesion / 25 +
    terrainBonus(ctx, defender.hex) +
    defPassives.defense +
    (defender.braced ? BRACE_DEFENSE : 0) +
    defender.resolve * 1.5;
  const margin = attack - defense;
  const riposte = defender.strength / 20 + (defender.braced ? BRACE_RIPOSTE : 0) + defPassives.counter;

  return {
    defenderStrength: clamp(Math.round(5 + margin), 1, 20),
    defenderCohesion: clamp(Math.round(7 + margin - defPassives.cohesion), 1, 25),
    attackerStrength: clamp(Math.round(1 + riposte - atkPassives.defense / 2), 0, 12),
    attackerCohesion: clamp(Math.round(2 + riposte / 2 - atkPassives.cohesion), 0, 10),
  };
}

function checkRout(ctx: ActionContext, squad: EngineSquad) {
  if (squad.status !== "active" || !squad.hex) {
    return;
  }
  const cause = squad.strength <= 0 ? "strength" : squad.cohesion <= 0 ? "cohesion" : null;
  if (!cause) {
    return;
  }
  ctx.emit({ kind: "rout", squadId: squad.id, hex: squad.hex, cause });
  squad.status = cause === "strength" ? "destroyed" : "routed";
  squad.hex = null;
  squad.braced = false;
}

function engage(ctx: ActionContext, attacker: ActiveSquad, defender: ActiveSquad, charge: boolean) {
  const pair = [attacker.id, defender.id].sort().join("|");
  if (!ctx.state.contacts.includes(pair)) {
    ctx.state.contacts.push(pair);
    for (const event of firstContact(ctx.fortune, attacker, defender)) {
      ctx.emit(event as EventBody);
    }
  }

  const losses = engagementLosses(ctx, attacker, defender, charge);
  const attackerHex = attacker.hex;
  const defenderHex = defender.hex;
  defender.strength = clamp(defender.strength - losses.defenderStrength, 0, 100);
  defender.cohesion = clamp(defender.cohesion - losses.defenderCohesion, 0, 100);
  attacker.strength = clamp(attacker.strength - losses.attackerStrength, 0, 100);
  attacker.cohesion = clamp(attacker.cohesion - losses.attackerCohesion, 0, 100);

  ctx.emit({
    kind: "engagement",
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerHex,
    defenderHex,
    charge,
    strengthChanges: { [attacker.id]: -losses.attackerStrength, [defender.id]: -losses.defenderStrength },
    cohesionChanges: { [attacker.id]: -losses.attackerCohesion, [defender.id]: -losses.defenderCohesion },
  });

  checkRout(ctx, defender);
  checkRout(ctx, attacker);
}

function strikeObjective(ctx: ActionContext, attacker: ActiveSquad, target: Extract<ResolvedTarget, { kind: "objective" }>) {
  const objective = target.objective;
  const base = attacker.role === "siege" ? SIEGE_OBJECTIVE_DAMAGE : BASE_OBJECTIVE_DAMAGE;
  // Enemies pressing on the attacker halve the blow.
  const harassed = adjacentEnemies(ctx.state, attacker).length > 0;
  const raw = (attacker.strength / 100) * base * (harassed ? 0.5 : 1);
  const damage = Math.max(1, Math.round(raw));
  const oldIntegrity = objective.integrity;
  objective.integrity = clamp(objective.integrity - damage, 0, 100);
  ctx.emit({
    kind: "objectiveDamage",
    objectiveId: objective.id,
    attackerId: attacker.id,
    hex: objective.hex,
    oldIntegrity,
    newIntegrity: objective.integrity,
  });
}

function goalsFor(ctx: ActionContext, target: ResolvedTarget): HexCoord[] {
  switch (target.kind) {
    case "squad":
      return boardNeighbors(ctx.scenario.board, target.squad.hex).map((hex) => hex.coord);
    case "objective":
      return boardNeighbors(ctx.scenario.board, target.objective.hex).map((hex) => hex.coord);
    case "hexes":
      return target.hexes;
  }
}

function isAdjacentTo(squad: ActiveSquad, target: ResolvedTarget): boolean {
  switch (target.kind) {
    case "squad":
      return hexDistance(squad.hex, target.squad.hex) === 1;
    case "objective":
      return hexDistance(squad.hex, target.objective.hex) === 1;
    case "hexes":
      return false;
  }
}

function hold(squad: ActiveSquad) {
  squad.braced = true;
}

/** Moves along the planned path. Returns false if the squad could not move at all. */
function moveToward(
  ctx: ActionContext,
  squad: ActiveSquad,
  target: ResolvedTarget,
  steps: number,
  reason: "advance" | "charge",
): boolean {
  const path = planAdvance(ctx.state, ctx.scenario.board, squad, goalsFor(ctx, target), steps);
  if (path.length < 2) {
    return false;
  }
  squad.hex = path[path.length - 1];
  ctx.emit({ kind: "move", squadId: squad.id, path, reason });
  return true;
}

function strike(ctx: ActionContext, squad: ActiveSquad, target: ResolvedTarget, charge: boolean) {
  if (target.kind === "squad") {
    engage(ctx, squad, target.squad, charge);
  } else if (target.kind === "objective") {
    strikeObjective(ctx, squad, target);
  }
}

export function executeAction(ctx: ActionContext, squad: ActiveSquad, action: Action) {
  switch (action.kind) {
    case "hold":
      hold(squad);
      return;

    case "advance": {
      const target = resolveTarget(ctx, squad, action.toward);
      if (!target) {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "no target" });
        return;
      }
      if (target.kind !== "hexes" && isAdjacentTo(squad, target)) {
        hold(squad); // already in position: brace there
        return;
      }
      if (!moveToward(ctx, squad, target, speedOf(squad), "advance")) {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "path blocked" });
      }
      return;
    }

    case "attack": {
      const target = resolveTarget(ctx, squad, action.target);
      if (!target) {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "no target" });
        return;
      }
      if (isAdjacentTo(squad, target)) {
        strike(ctx, squad, target, false);
        return;
      }
      if (!moveToward(ctx, squad, target, speedOf(squad), "advance")) {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "path blocked" });
      }
      return;
    }

    case "counterCharge": {
      const target = resolveTarget(ctx, squad, action.target);
      if (!target) {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "no target" });
        return;
      }
      if (!isAdjacentTo(squad, target)) {
        moveToward(ctx, squad, target, speedOf(squad) + 1, "charge");
      }
      if (isAdjacentTo(squad, target)) {
        strike(ctx, squad, target, true);
      } else {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "charge fell short" });
      }
      return;
    }

    case "fallBack": {
      const path = planFallBack(ctx.state, ctx.scenario.board, squad, action.hexes);
      if (path.length < 2) {
        // Cornered: nowhere to go, so the squad stands and braces.
        hold(squad);
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "cornered, bracing instead" });
        return;
      }
      squad.hex = path[path.length - 1];
      ctx.emit({ kind: "move", squadId: squad.id, path, reason: "fallBack" });
      return;
    }

    case "rally": {
      const target = alliesOf(ctx.state, squad)
        .filter((ally) => hexDistance(ally.hex, squad.hex) === 1 && ally.cohesion < 100)
        .sort((a, b) => a.cohesion - b.cohesion)[0];
      if (!target) {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "no ally to rally" });
        return;
      }
      const amount = clamp(Math.round(RALLY_BASE + passivesOf(ctx, squad).cohesion + squad.resolve), 2, 15);
      const restored = Math.min(amount, 100 - target.cohesion);
      target.cohesion += restored;
      ctx.emit({ kind: "rally", sourceId: squad.id, targetId: target.id, restored });
      return;
    }
  }
}
