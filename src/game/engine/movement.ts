// Hex movement: occupancy, BFS pathing, zones of control and falling back.
// All tie-breaks follow hexNeighbors order so paths are deterministic.
import {
  boardNeighbors,
  getHex,
  hexDistance,
  hexKey,
  isPassableTerrain,
  sameHex,
  type BoardLayout,
  type HexCoord,
} from "../board";
import type { EngineState } from "./types";
import { enemiesOf, squadAt, type ActiveSquad } from "./world";

/** A hex can be entered if it is on the board, passable, not an objective and unoccupied. */
export function canEnter(state: EngineState, board: BoardLayout, hex: HexCoord): boolean {
  const boardHex = getHex(board, hex);

  return Boolean(
    boardHex &&
      isPassableTerrain(boardHex.terrain) &&
      !state.objectives.some((objective) => sameHex(objective.hex, hex)) &&
      !squadAt(state, hex),
  );
}

/** Entering marsh ends the move; so does entering a ford in rain. */
function slowedByWeather(state: EngineState, board: BoardLayout, hex: HexCoord): boolean {
  const terrain = getHex(board, hex)?.terrain;
  return terrain === "marsh" || (state.weather === "rain" && terrain === "ford");
}

function inEnemyZone(state: EngineState, squad: ActiveSquad, hex: HexCoord): boolean {
  return enemiesOf(state, squad).some((enemy) => hexDistance(enemy.hex, hex) === 1);
}

/**
 * Path (including the start hex) for moving up to `maxSteps` toward any of `goals`.
 * - Already on a goal: no move.
 * - A goal is reachable: follow the shortest path to it.
 * - Otherwise: move to the reachable hex that gets closest to the goals (never further).
 * Movement stops after entering a hex adjacent to an enemy (zone of control).
 */
export function planAdvance(
  state: EngineState,
  board: BoardLayout,
  squad: ActiveSquad,
  goals: HexCoord[],
  maxSteps: number,
): HexCoord[] {
  const start = squad.hex;
  if (goals.length === 0 || goals.some((goal) => sameHex(goal, start))) {
    return [{ ...start }];
  }

  const goalKeys = new Set(goals.map(hexKey));
  const heuristic = (hex: HexCoord) => Math.min(...goals.map((goal) => hexDistance(goal, hex)));
  const parent = new Map<string, HexCoord | null>([[hexKey(start), null]]);
  const visited: { hex: HexCoord; dist: number }[] = [{ hex: start, dist: 0 }];

  for (let index = 0; index < visited.length; index += 1) {
    const current = visited[index];
    for (const neighbor of boardNeighbors(board, current.hex)) {
      const key = hexKey(neighbor.coord);
      if (parent.has(key) || !canEnter(state, board, neighbor.coord)) {
        continue;
      }
      parent.set(key, current.hex);
      visited.push({ hex: { ...neighbor.coord }, dist: current.dist + 1 });
    }
  }

  // BFS order already sorts by distance, so the first goal found is a nearest one.
  let destination = visited.find((node) => goalKeys.has(hexKey(node.hex)))?.hex;

  if (!destination) {
    let best = visited[0];
    for (const node of visited) {
      if (heuristic(node.hex) < heuristic(best.hex)) {
        best = node;
      }
    }
    destination = best.hex;
  }

  const fullPath: HexCoord[] = [];
  for (let step: HexCoord | null = destination; step; step = parent.get(hexKey(step)) ?? null) {
    fullPath.unshift(step);
  }

  const path: HexCoord[] = [{ ...start }];
  for (const hex of fullPath.slice(1, maxSteps + 1)) {
    path.push(hex);
    if (inEnemyZone(state, squad, hex) || slowedByWeather(state, board, hex)) {
      break;
    }
  }
  return path;
}

/** How strongly a withdrawal pulls toward the line of retreat (per hex closer to it). */
export const HOMEWARD_PULL = 60;

function fallBackScore(threats: ActiveSquad[], hex: HexCoord, homeward: HexCoord[]): number {
  const distances = threats.map((enemy) => hexDistance(enemy.hex, hex));
  const retreat = homeward.length > 0 ? Math.min(...homeward.map((home) => hexDistance(home, hex))) * HOMEWARD_PULL : 0;
  return Math.min(...distances) * 100 + distances.reduce((sum, value) => sum + value, 0) - retreat;
}

/**
 * Path (including the start hex) for falling back up to `hexes` steps. Each step goes
 * to the neighbor that most increases distance from the enemy (nearest enemy first,
 * then total distance). Zones of control do not apply; disengaging is the point.
 */
export function planFallBack(
  state: EngineState,
  board: BoardLayout,
  squad: ActiveSquad,
  hexes: number,
  /** The enemies the squad is falling back from: what it perceives, not the true state. */
  threats: ActiveSquad[],
  /** The side's line of retreat (its exit hexes, if it has any): a withdrawal leans toward it. */
  homeward: HexCoord[] = [],
): HexCoord[] {
  const path: HexCoord[] = [{ ...squad.hex }];
  if (threats.length === 0) {
    return path;
  }

  for (let step = 0; step < hexes; step += 1) {
    const current = path[path.length - 1];
    let best: HexCoord | undefined;
    let bestScore = fallBackScore(threats, current, homeward);

    for (const neighbor of boardNeighbors(board, current)) {
      const visitedAlready = path.some((hex) => sameHex(hex, neighbor.coord));
      if (visitedAlready || !canEnter(state, board, neighbor.coord)) {
        continue;
      }
      const score = fallBackScore(threats, neighbor.coord, homeward);
      if (score > bestScore) {
        best = { ...neighbor.coord };
        bestScore = score;
      }
    }

    if (!best) {
      break;
    }
    path.push(best);
    if (slowedByWeather(state, board, best)) {
      break;
    }
  }
  return path;
}
