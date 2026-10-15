// Read-only queries over engine state shared by rules, movement and actions.
import { hexDistance, sameHex, type HexCoord } from "../board";
import type { EngineSquad, EngineState, SquadRole } from "./types";

export type ActiveSquad = EngineSquad & { hex: HexCoord };

export function isActive(squad: EngineSquad): squad is ActiveSquad {
  return squad.status === "active" && squad.hex !== null;
}

export function activeSquads(state: EngineState): ActiveSquad[] {
  return state.squads.filter(isActive);
}

export function enemiesOf(state: EngineState, squad: EngineSquad): ActiveSquad[] {
  return activeSquads(state).filter((other) => other.faction !== squad.faction);
}

export function alliesOf(state: EngineState, squad: EngineSquad): ActiveSquad[] {
  return activeSquads(state).filter((other) => other.faction === squad.faction && other.id !== squad.id);
}

export function squadAt(state: EngineState, hex: HexCoord): ActiveSquad | undefined {
  return activeSquads(state).find((squad) => sameHex(squad.hex, hex));
}

export function getSquad(state: EngineState, squadId: string): EngineSquad {
  const squad = state.squads.find((item) => item.id === squadId);
  if (!squad) {
    throw new Error(`Unknown squad: ${squadId}`);
  }
  return squad;
}

/** Stable sort by distance from `from`, ties broken by squad list order. */
export function byDistance<T extends ActiveSquad>(squads: T[], from: HexCoord): T[] {
  return squads
    .map((squad, index) => ({ squad, index, distance: hexDistance(squad.hex, from) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map((entry) => entry.squad);
}

export function adjacentEnemies(state: EngineState, squad: ActiveSquad): ActiveSquad[] {
  return enemiesOf(state, squad).filter((enemy) => hexDistance(enemy.hex, squad.hex) === 1);
}

export function isOverextended(state: EngineState, squad: ActiveSquad): boolean {
  return !alliesOf(state, squad).some((ally) => hexDistance(ally.hex, squad.hex) === 1);
}

const roleSpeed: Record<SquadRole, number> = {
  cavalry: 2,
  frontline: 1,
  skirmish: 1,
  support: 1,
  siege: 1,
};

export function speedOf(squad: EngineSquad): number {
  return roleSpeed[squad.role];
}
