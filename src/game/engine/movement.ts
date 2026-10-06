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
  type TerrainType,
} from "../board";
import type { EngineState, Weather } from "./types";
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

/** Passable, not an objective: ground a squad could stand on if it were empty. */
function canStandOn(state: EngineState, board: BoardLayout, hex: HexCoord): boolean {
  const boardHex = getHex(board, hex);
  return Boolean(boardHex && isPassableTerrain(boardHex.terrain) && !state.objectives.some((objective) => sameHex(objective.hex, hex)));
}

/** Entering marsh ends the move; so does entering a ford in rain. (Exported for the UI's terrain readout.) */
export function endsMove(terrain: TerrainType | undefined, weather: Weather): boolean {
  return terrain === "marsh" || (weather === "rain" && terrain === "ford");
}

function slowedByWeather(state: EngineState, board: BoardLayout, hex: HexCoord): boolean {
  return endsMove(getHex(board, hex)?.terrain, state.weather);
}

function inEnemyZone(state: EngineState, squad: ActiveSquad, hex: HexCoord): boolean {
  return enemiesOf(state, squad).some((enemy) => hexDistance(enemy.hex, hex) === 1);
}

/**
 * Hexes connected to `start` over passable, non-objective ground, ignoring squads (they
 * move; the ground does not). Keys from hexKey.
 */
function groundReachable(state: EngineState, board: BoardLayout, start: HexCoord): Set<string> {
  const seen = new Set([hexKey(start)]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    for (const neighbor of boardNeighbors(board, queue[index])) {
      const key = hexKey(neighbor.coord);
      if (seen.has(key) || !isPassableTerrain(neighbor.terrain) || state.objectives.some((objective) => sameHex(objective.hex, neighbor.coord))) {
        continue;
      }
      seen.add(key);
      queue.push(neighbor.coord);
    }
  }
  return seen;
}

/**
 * The route (including the start hex, not cut short) a squad would take toward any of
 * `targets` (the targets it could stand on; see groundReachable).
 * - Already on a goal: no move.
 * - A goal is reachable: the shortest path to it.
 * - Otherwise: to the reachable hex that gets closest to the goals (never further).
 * Planned on what the mover knows (C5): the hexes of enemies it cannot see (`unseen`) count
 * as open ground, so the route never depends on them; meeting one is the walk's business.
 */
export function planRoute(state: EngineState, board: BoardLayout, squad: ActiveSquad, targets: HexCoord[], unseen: HexCoord[] = []): HexCoord[] {
  const start = squad.hex;
  const hidden = new Set(unseen.map(hexKey));
  const plannable = (hex: HexCoord) => canEnter(state, board, hex) || (hidden.has(hexKey(hex)) && canStandOn(state, board, hex));
  // A goal must be ground the mover could stand on (C4): a deep-water or walled neighbour
  // of the target is no goal, or a mover already beside it would never close on the real
  // approach. A target walled in entirely keeps every goal (the old nearest approach).
  const open = groundReachable(state, board, start);
  const usable = targets.filter((goal) => open.has(hexKey(goal)));
  const goals = usable.length > 0 ? usable : targets;
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
      if (parent.has(key) || !plannable(neighbor.coord)) {
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

  const route: HexCoord[] = [];
  for (let step: HexCoord | null = destination; step; step = parent.get(hexKey(step)) ?? null) {
    route.unshift(step);
  }
  return route;
}

/**
 * Path (including the start hex) for moving up to `maxSteps` along planRoute toward any of
 * `targets`. Movement stops after entering a hex adjacent to an enemy (zone of control), and
 * short of a hex an unseen enemy stands on (contact: the route was planned through it).
 */
export function planAdvance(
  state: EngineState,
  board: BoardLayout,
  squad: ActiveSquad,
  targets: HexCoord[],
  maxSteps: number,
  unseen: HexCoord[] = [],
): HexCoord[] {
  const path: HexCoord[] = [{ ...squad.hex }];
  for (const hex of planRoute(state, board, squad, targets, unseen).slice(1, maxSteps + 1)) {
    if (squadAt(state, hex)) break;
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
 * The withdrawal (including the start hex, not cut short) a squad would plan, up to `hexes`
 * steps. Each step goes to the neighbor that most increases distance from the enemy
 * (nearest enemy first, then total distance). Zones of control do not apply; disengaging
 * is the point. Planned on what the squad knows (C5): the hexes of enemies it cannot see
 * (`unseen`) count as open ground; meeting one is planFallBack's business.
 */
export function planWithdrawal(
  state: EngineState,
  board: BoardLayout,
  squad: ActiveSquad,
  hexes: number,
  /** The enemies the squad is falling back from: what it perceives, not the true state. */
  threats: ActiveSquad[],
  /** The side's line of retreat (its exit hexes, if it has any): a withdrawal leans toward it. */
  homeward: HexCoord[] = [],
  unseen: HexCoord[] = [],
): HexCoord[] {
  const path: HexCoord[] = [{ ...squad.hex }];
  if (threats.length === 0) {
    return path;
  }
  const hidden = new Set(unseen.map(hexKey));
  const plannable = (hex: HexCoord) => canEnter(state, board, hex) || (hidden.has(hexKey(hex)) && canStandOn(state, board, hex));

  for (let step = 0; step < hexes; step += 1) {
    const current = path[path.length - 1];
    let best: HexCoord | undefined;
    let bestScore = fallBackScore(threats, current, homeward);

    for (const neighbor of boardNeighbors(board, current)) {
      const visitedAlready = path.some((hex) => sameHex(hex, neighbor.coord));
      if (visitedAlready || !plannable(neighbor.coord)) {
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

/**
 * Path (including the start hex) for falling back up to `hexes` steps along planWithdrawal,
 * stopping short of a hex an unseen enemy stands on (contact: it was planned through).
 */
export function planFallBack(
  state: EngineState,
  board: BoardLayout,
  squad: ActiveSquad,
  hexes: number,
  threats: ActiveSquad[],
  homeward: HexCoord[] = [],
  unseen: HexCoord[] = [],
): HexCoord[] {
  const path: HexCoord[] = [{ ...squad.hex }];
  for (const hex of planWithdrawal(state, board, squad, hexes, threats, homeward, unseen).slice(1)) {
    if (squadAt(state, hex)) break;
    path.push(hex);
  }
  return path;
}
