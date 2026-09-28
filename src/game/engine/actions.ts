// Action execution and combat math. Mutates the working copy of state that
// resolvePhase owns, and reports everything that happened through `emit`.
import { boardNeighbors, getHex, hexDistance, terrainDefenseBonus, type HexCoord } from "../board";
import { checkRout, clamp, type EngineContext } from "./context";
import { firstContact } from "./fortune";
import { planAdvance, planFallBack } from "./movement";
import { exitHexesFor } from "./outcome";
import { perceive, perceivedAdjacentEnemies } from "./perception";
import { resolveTarget, type ResolvedTarget } from "./rules";
import type { Action, DoctrinePassives, EngineSquad, SquadRole } from "./types";
import { adjacentEnemies, alliesOf, byDistance, speedOf, type ActiveSquad } from "./world";

export type ActionContext = EngineContext;

// Tuning constants. Kept together so the balance harness can find them.
export const BRACE_DEFENSE = 2;
export const BRACE_RIPOSTE = 1.5;
/**
 * A braced defender bites back: every blow it takes while braced costs the attacker
 * BRACE_BITE strength and cohesion per point of defense passive above BRACE_BITE_FROM.
 * Shield the Line (defense 3) is the wall; doctrines built to strike or endure
 * (defense 1) do not bite. Resolve does not scale it: it already hardens the defense,
 * and a veteran wall that also bit harder could not be broken.
 */
export const BRACE_BITE = 3;
export const BRACE_BITE_FROM = 1;
export const CHARGE_BONUS = 2;
export const SURGE_BONUS = 3;
/** Each neighbour of a supported charge target adds (strength/20 + this) to the riposte. */
export const RECKLESS_SUPPORT_RIPOSTE = 2;
/** Base defender losses per blow, before the attack/defense margin. Battles turn on cohesion. */
export const STRENGTH_LOSS_BASE = 3;
export const COHESION_LOSS_BASE = 13;
/** Ripostes are softened so the Host can sustain pressure on a braced line. */
export const RIPOSTE_SCALE = 0.5;
export const SIEGE_OBJECTIVE_DAMAGE = 40;
export const BASE_OBJECTIVE_DAMAGE = 12;
/** A bombardment's blow at full strength (scaled by strength/100, like a ram's). */
export const BOMBARD_DAMAGE = 10;
export const RALLY_BASE = 12;
/** A ward (noncombatant) below this cohesion is rallied before any other adjacent ally. */
export const RALLY_WARD_BELOW = 75;
export const ASH_WIND_HOST_COHESION = 1;

/** Role fit: support and skirmish companies are poor at holding a line or brawling. */
export const ROLE_ATTACK: Record<SquadRole, number> = {
  frontline: 0,
  skirmish: -1,
  support: -3,
  cavalry: 0,
  siege: 0,
};
export const ROLE_DEFENSE: Record<SquadRole, number> = {
  frontline: 1,
  skirmish: -1,
  support: -2,
  cavalry: -1,
  siege: -2,
};
/** Extra punch for cavalry on a clean charge. */
export const CAVALRY_CHARGE_BONUS = 2;

/** Doctrine passives after weather: rain halves counter; ash-wind steadies the Host. */
export function effectivePassives(ctx: EngineContext, squad: EngineSquad): DoctrinePassives {
  const base = ctx.doctrines[squad.doctrineId].passives;
  const ashWind = ctx.state.weather === "ashWind" && squad.faction === "ashen_host";
  return {
    defense: base.defense,
    cohesion: base.cohesion + (ashWind ? ASH_WIND_HOST_COHESION : 0),
    counter: ctx.state.weather === "rain" ? base.counter / 2 : base.counter,
  };
}

function terrainBonus(ctx: EngineContext, hex: HexCoord): number {
  const boardHex = getHex(ctx.scenario.board, hex);
  return boardHex ? terrainDefenseBonus(boardHex.terrain) : 0;
}

export interface EngagementLosses {
  defenderStrength: number;
  defenderCohesion: number;
  attackerStrength: number;
  attackerCohesion: number;
  /** A charge into a supported enemy: no charge bonus, and its neighbours join the riposte. */
  reckless: boolean;
}

/** Pure combat math: losses (positive numbers) for one strike and its riposte. */
export function engagementLosses(
  ctx: EngineContext,
  attacker: ActiveSquad,
  defender: ActiveSquad,
  charge: boolean,
  power = 0,
): EngagementLosses {
  const atkPassives = effectivePassives(ctx, attacker);
  const defPassives = effectivePassives(ctx, defender);
  // A clean counterstroke hits an exposed enemy. Charging into a supported one is reckless.
  const supporters = charge
    ? alliesOf(ctx.state, defender).filter((ally) => hexDistance(ally.hex, defender.hex) === 1)
    : [];
  const reckless = supporters.length > 0;
  const attack =
    attacker.strength / 10 +
    attacker.resolve +
    ROLE_ATTACK[attacker.role] +
    (charge && !reckless ? CHARGE_BONUS + atkPassives.counter + (attacker.role === "cavalry" ? CAVALRY_CHARGE_BONUS : 0) : 0) +
    (attacker.surging ? SURGE_BONUS : 0) +
    power;
  const defense =
    defender.cohesion / 25 +
    terrainBonus(ctx, defender.hex) +
    ROLE_DEFENSE[defender.role] +
    defPassives.defense +
    (defender.braced ? BRACE_DEFENSE : 0) +
    (defender.surging ? SURGE_BONUS : 0) +
    defender.resolve;
  const margin = attack - defense;
  const riposte =
    defender.strength / 25 +
    (defender.braced ? BRACE_RIPOSTE : 0) +
    defPassives.counter +
    supporters.reduce((sum, ally) => sum + ally.strength / 20 + RECKLESS_SUPPORT_RIPOSTE, 0);
  const cap = reckless ? 20 : 12;
  const bite = defender.braced ? BRACE_BITE * Math.max(0, defPassives.defense - BRACE_BITE_FROM) : 0;

  return {
    defenderStrength: clamp(Math.round(STRENGTH_LOSS_BASE + margin), 1, 20),
    defenderCohesion: clamp(Math.round(COHESION_LOSS_BASE + margin - defPassives.cohesion), 2, 25),
    attackerStrength: clamp(Math.round(RIPOSTE_SCALE * riposte - atkPassives.defense / 2) + bite, 0, cap),
    attackerCohesion: clamp(Math.round(1 + (RIPOSTE_SCALE * riposte) / 2 - atkPassives.cohesion) + bite, 0, cap),
    reckless,
  };
}

function engage(ctx: EngineContext, attacker: ActiveSquad, defender: ActiveSquad, charge: boolean, power = 0) {
  const pair = [attacker.id, defender.id].sort().join("|");
  if (!ctx.state.contacts.includes(pair)) {
    ctx.state.contacts.push(pair);
    firstContact(ctx, attacker, defender);
    // Dread can rout either side before the blow lands.
    if (attacker.status !== "active" || defender.status !== "active") {
      return;
    }
  }

  const losses = engagementLosses(ctx, attacker, defender, charge, power);
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
    reckless: losses.reckless,
    strengthChanges: { [attacker.id]: -losses.attackerStrength, [defender.id]: -losses.defenderStrength },
    cohesionChanges: { [attacker.id]: -losses.attackerCohesion, [defender.id]: -losses.defenderCohesion },
  });

  checkRout(ctx, defender);
  checkRout(ctx, attacker);
}

function strikeObjective(
  ctx: EngineContext,
  attacker: ActiveSquad,
  target: Extract<ResolvedTarget, { kind: "objective" }>,
  base = attacker.role === "siege" ? SIEGE_OBJECTIVE_DAMAGE : BASE_OBJECTIVE_DAMAGE,
) {
  const objective = target.objective;
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

function goalsFor(ctx: EngineContext, target: ResolvedTarget): HexCoord[] {
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

/** Brace in place, except in marsh: there is no firm footing to brace on. */
function hold(ctx: EngineContext, squad: ActiveSquad) {
  squad.braced = getHex(ctx.scenario.board, squad.hex)?.terrain !== "marsh";
}

/** Moves along the planned path. Returns false if the squad could not move at all. */
function moveToward(
  ctx: EngineContext,
  squad: ActiveSquad,
  target: ResolvedTarget,
  steps: number,
  reason: "advance" | "charge",
): boolean {
  const path = planAdvance(ctx.state, ctx.scenario.board, squad, goalsFor(ctx, target), steps);
  if (path.length < 2) {
    return false;
  }
  squad.hex = { ...path[path.length - 1] };
  ctx.emit({ kind: "move", squadId: squad.id, path, from: path[0], to: path[path.length - 1], reason });
  return true;
}

/** True only for an enemy squad or an objective the squad's faction assaults. */
function isHostile(squad: ActiveSquad, target: ResolvedTarget): boolean {
  switch (target.kind) {
    case "squad":
      return target.squad.faction !== squad.faction;
    case "objective":
      return target.objective.defender !== squad.faction;
    case "hexes":
      return false;
  }
}

function strike(ctx: EngineContext, squad: ActiveSquad, target: ResolvedTarget, charge: boolean, power = 0) {
  if (squad.noncombatant) {
    ctx.emit({ kind: "blocked", squadId: squad.id, reason: "does not fight" });
    return;
  }
  // Types keep offensive actions on enemy selectors, but editor JSON can bypass them.
  if (!isHostile(squad, target)) {
    ctx.emit({ kind: "blocked", squadId: squad.id, reason: "will not strike its own side" });
    return;
  }
  if (target.kind === "squad") {
    engage(ctx, squad, target.squad, charge, power);
  } else if (target.kind === "objective") {
    strikeObjective(ctx, squad, target);
  }
}

export function executeAction(ctx: EngineContext, squad: ActiveSquad, action: Action) {
  switch (action.kind) {
    case "hold":
      hold(ctx, squad);
      return;

    case "advance": {
      const target = resolveTarget(ctx, squad, action.toward);
      if (!target) {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "no target" });
        return;
      }
      if (target.kind !== "hexes" && isAdjacentTo(squad, target)) {
        hold(ctx, squad); // already in position: brace there
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
      if (!isHostile(squad, target)) {
        strike(ctx, squad, target, false); // reports the refusal without moving
        return;
      }
      if (isAdjacentTo(squad, target)) {
        strike(ctx, squad, target, false, action.power ?? 0);
        return;
      }
      if (moveToward(ctx, squad, target, speedOf(squad), "advance")) {
        return;
      }
      // No way through: fight whoever bars the way instead.
      const blocker = byDistance(perceivedAdjacentEnemies(perceive(ctx, squad)), squad.hex)[0];
      if (blocker) {
        engage(ctx, squad, blocker, false);
      } else {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "path blocked" });
      }
      return;
    }

    case "bombard": {
      const target = resolveTarget(ctx, squad, { kind: "objective", side: "enemy" });
      if (!target || target.kind !== "objective") {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "no target" });
        return;
      }
      if (hexDistance(squad.hex, target.objective.hex) <= action.range) {
        strikeObjective(ctx, squad, target, BOMBARD_DAMAGE);
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
      if (!isHostile(squad, target)) {
        strike(ctx, squad, target, true); // reports the refusal without moving
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
      const homeward = exitHexesFor(ctx.scenario, squad.faction) ?? [];
      const path = planFallBack(ctx.state, ctx.scenario.board, squad, action.hexes, perceive(ctx, squad).enemies, homeward);
      if (path.length < 2) {
        // Cornered: nowhere to go, so the squad stands and braces.
        hold(ctx, squad);
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "cornered, bracing instead" });
        return;
      }
      squad.hex = { ...path[path.length - 1] };
      ctx.emit({ kind: "move", squadId: squad.id, path, from: path[0], to: path[path.length - 1], reason: "fallBack" });
      return;
    }

    case "rally": {
      // Weakest adjacent ally first; a shaken ward (a column under escort) comes before everyone.
      const shakenWard = (ally: ActiveSquad) => (ally.noncombatant && ally.cohesion < RALLY_WARD_BELOW ? 0 : 1);
      const target = alliesOf(ctx.state, squad)
        .filter((ally) => hexDistance(ally.hex, squad.hex) === 1 && ally.cohesion < 100)
        .sort((a, b) => shakenWard(a) - shakenWard(b) || a.cohesion - b.cohesion)[0];
      if (!target) {
        ctx.emit({ kind: "blocked", squadId: squad.id, reason: "no ally to rally" });
        return;
      }
      const amount = clamp(Math.round(RALLY_BASE + effectivePassives(ctx, squad).cohesion + squad.resolve), 2, 20);
      const restored = Math.min(amount, 100 - target.cohesion);
      target.cohesion += restored;
      ctx.emit({ kind: "rally", sourceId: squad.id, targetId: target.id, restored });
      return;
    }
  }
}
