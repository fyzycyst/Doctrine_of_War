// The muster step (T21): at the start of each command window the player may shift
// companies that are not in contact by one hex (cavalry two), or relieve a company in
// contact by swapping a fresh neighbour into its place. Orders, not clicks: one short
// repositioning, then the doctrines take over.
//
// Fog: validation and the options list read only what the player's side can see (an
// unseen enemy's hex looks free). Applying a muster resolves on the true state: a
// company that bumps into an unseen enemy halts short, with a neutral reason.
import { boardNeighbors, getHex, hexDistance, hexKey, isPassableTerrain, sameHex, type HexCoord } from "../board";
import type { EngineContext, EventBody, RuleContext } from "./context";
import { exitHexesFor } from "./outcome";
import { perceive } from "./perception";
import type { EngineScenario, EngineState } from "./types";
import { activeSquads, isActive, speedOf, type ActiveSquad } from "./world";

/** Move a company up to its muster reach, or swap a fresh company into an engaged one's place. */
export type MusterMove = { squadId: string; to: HexCoord } | { squadId: string; relieve: string };

/** Per company: where it may muster to, and which engaged neighbours it may relieve. */
export interface MusterOption {
  squadId: string;
  hexes: HexCoord[];
  relieve: string[];
}

/** Per-squad plain-language reasons; empty when the muster is valid. */
export type MusterProblems = Record<string, string>;

/** The neutral reason a company halts on an unseen obstacle (it names nothing). */
export const MUSTER_HALTED = "The way was barred.";

const isRelief = (move: MusterMove): move is { squadId: string; relieve: string } => "relieve" in move;

/** What the mustering side knows: its own companies (where they stand now) and the enemies it sees. */
interface Knowledge {
  ctx: RuleContext;
  own: Map<string, ActiveSquad>;
  enemies: ActiveSquad[];
}

function knowledge(state: EngineState, scenario: EngineScenario, truth: boolean): Knowledge {
  const ctx = { state, scenario };
  const own = new Map(
    activeSquads(state)
      .filter((squad) => squad.faction === scenario.playerFaction)
      .map((squad) => [squad.id, { ...squad, hex: { ...squad.hex } }]),
  );
  const first = [...own.values()][0];
  const enemies = truth || !first
    ? activeSquads(state).filter((squad) => squad.faction !== scenario.playerFaction)
    : perceive(ctx, first).enemies;
  return { ctx, own, enemies };
}

const occupant = (know: Knowledge, hex: HexCoord) =>
  [...know.own.values()].find((squad) => sameHex(squad.hex, hex)) ?? know.enemies.find((enemy) => sameHex(enemy.hex, hex));

/** In contact: an enemy stands next to it (neighbours always see each other, so this is never hidden). */
function inContact(state: EngineState, squad: ActiveSquad): boolean {
  return activeSquads(state).some((other) => other.faction !== squad.faction && hexDistance(other.hex, squad.hex) === 1);
}

/** Every hex `squad` can muster to by known-clear paths, with the path to each (start included). */
function reach(know: Knowledge, squad: ActiveSquad): Map<string, HexCoord[]> {
  const { scenario } = know.ctx;
  const steps = speedOf(squad);
  const paths = new Map<string, HexCoord[]>([[hexKey(squad.hex), [{ ...squad.hex }]]]);
  let frontier: HexCoord[][] = [[{ ...squad.hex }]];
  for (let step = 0; step < steps; step += 1) {
    const next: HexCoord[][] = [];
    for (const path of frontier) {
      const here = path[path.length - 1];
      // Zone of control, marsh and fords in rain end a muster just as they end a move.
      if (path.length > 1 && stops(know, here)) continue;
      for (const neighbour of boardNeighbors(scenario.board, here)) {
        const key = hexKey(neighbour.coord);
        if (paths.has(key) || !enterable(know, neighbour.coord) || occupant(know, neighbour.coord)) continue;
        const extended = [...path, { ...neighbour.coord }];
        paths.set(key, extended);
        next.push(extended);
      }
    }
    frontier = next;
  }
  paths.delete(hexKey(squad.hex));
  return paths;
}

function enterable(know: Knowledge, hex: HexCoord): boolean {
  const boardHex = getHex(know.ctx.scenario.board, hex);
  return Boolean(boardHex && isPassableTerrain(boardHex.terrain) && !know.ctx.state.objectives.some((objective) => sameHex(objective.hex, hex)));
}

function stops(know: Knowledge, hex: HexCoord): boolean {
  const terrain = getHex(know.ctx.scenario.board, hex)?.terrain;
  return (
    know.enemies.some((enemy) => hexDistance(enemy.hex, hex) === 1) ||
    terrain === "marsh" ||
    (know.ctx.state.weather === "rain" && terrain === "ford")
  );
}

/** Why `hex` is not a muster target for `squad`, in the words the player sees. */
function moveProblem(know: Knowledge, squad: ActiveSquad, hex: HexCoord): string | null {
  const boardHex = getHex(know.ctx.scenario.board, hex);
  if (!boardHex) return "That hex is off the field.";
  if (sameHex(hex, squad.hex)) return `${squad.name} is already there.`;
  const objective = know.ctx.state.objectives.find((item) => sameHex(item.hex, hex));
  if (objective) {
    return `${objective.name} cannot be garrisoned.`;
  }
  if (!isPassableTerrain(boardHex.terrain)) {
    return `No company can stand on ${boardHex.terrain === "river" ? "deep river" : "the wall"}.`;
  }
  const holder = occupant(know, hex);
  if (holder) {
    return holder.faction === squad.faction ? `${holder.name} already holds that hex.` : "An enemy holds that hex.";
  }
  const steps = speedOf(squad);
  if (hexDistance(squad.hex, hex) > steps) {
    return `Too far: ${squad.name} can muster ${steps === 1 ? "1 hex" : `${steps} hexes`}.`;
  }
  if (!reach(know, squad).has(hexKey(hex))) return `No clear way there within ${steps === 1 ? "1 hex" : `${steps} hexes`}.`;
  return null;
}

/**
 * Checks a muster against what the player's side knows, applying the moves in order
 * (a hex one company leaves is free for the next). Returns a plain-language reason for
 * each company whose move is refused; an empty object means the muster is valid.
 */
export function validateMuster(state: EngineState, scenario: EngineScenario, moves: MusterMove[]): MusterProblems {
  const problems: MusterProblems = {};
  const know = knowledge(state, scenario, false);
  const used = new Set<string>();
  for (const move of moves) {
    const squad = state.squads.find((item) => item.id === move.squadId);
    const refuse = (reason: string) => {
      problems[move.squadId] ??= reason;
    };
    if (!squad || squad.faction !== scenario.playerFaction) {
      refuse("Only your own companies can muster.");
      continue;
    }
    if (squad.noncombatant) {
      refuse("The Column moves on its own orders.");
      continue;
    }
    const current = know.own.get(squad.id);
    if (!current) {
      refuse(`${squad.name} is no longer on the field.`);
      continue;
    }
    if (used.has(squad.id)) {
      refuse(`${squad.name} has already mustered this phase.`);
      continue;
    }
    if (isRelief(move)) {
      const partner = state.squads.find((item) => item.id === move.relieve);
      const tired = partner ? know.own.get(partner.id) : undefined;
      if (!partner || partner.faction !== scenario.playerFaction || partner.noncombatant || !tired) {
        refuse("Only one of your companies in the line can be relieved.");
        continue;
      }
      if (used.has(tired.id)) {
        refuse(`${tired.name} has already mustered this phase.`);
        continue;
      }
      if (inContact(state, current)) {
        refuse(`${current.name} is in contact itself and cannot relieve.`);
        continue;
      }
      if (!inContact(state, tired)) {
        refuse(`${tired.name} is not in contact: muster it instead.`);
        continue;
      }
      if (hexDistance(current.hex, tired.hex) !== 1) {
        refuse(`${current.name} must stand next to ${tired.name} to relieve it.`);
        continue;
      }
      const line = { ...tired.hex };
      tired.hex = { ...current.hex };
      current.hex = line;
      used.add(current.id).add(tired.id);
      continue;
    }
    if (inContact(state, current)) {
      refuse(`${current.name} is in contact and cannot pull back. Relieve it instead.`);
      continue;
    }
    const problem = moveProblem(know, current, move.to);
    if (problem) {
      refuse(problem);
      continue;
    }
    current.hex = { ...move.to };
    used.add(current.id);
  }
  return problems;
}

/**
 * Where each of the player's companies may muster right now, and which engaged
 * neighbours it may relieve (from what the player's side can see). Companies in
 * contact get no hexes; the Column and companies that left the field are omitted.
 */
export function musterOptions(state: EngineState, scenario: EngineScenario): MusterOption[] {
  const know = knowledge(state, scenario, false);
  return [...know.own.values()]
    .filter((squad) => !squad.noncombatant)
    .map((squad) => {
      const contact = inContact(state, squad);
      const relieve = contact
        ? []
        : [...know.own.values()]
            .filter((other) => !other.noncombatant && hexDistance(other.hex, squad.hex) === 1 && inContact(state, other))
            .map((other) => other.id);
      return { squadId: squad.id, hexes: contact ? [] : [...reach(know, squad).values()].map((path) => path[path.length - 1]), relieve };
    });
}

/**
 * Applies a valid muster on the true state through `ctx` (beat 0 of a phase): moves walk
 * their known-clear path and halt short of an unseen enemy (or in its zone of control);
 * a relief swaps the two companies. Emits `mustered` and `relieved` events.
 */
export function executeMuster(ctx: EngineContext, moves: MusterMove[]) {
  const { state, scenario } = ctx;
  const problems = validateMuster(state, scenario, moves);
  const first = Object.entries(problems)[0];
  if (first) {
    throw new Error(`Invalid muster for ${first[0]}: ${first[1]}`);
  }
  // Every planned move ends in exactly one outcome for its company: a `mustered` move (a
  // relief also emits `relieved`), or a neutral `blocked` when it cannot be carried out as
  // planned (an earlier move halted short, the way is gone): never silence, never a cause.
  const barred = (squadId: string) => ctx.emit({ kind: "blocked", squadId, reason: MUSTER_HALTED });
  for (const move of moves) {
    const squad = state.squads.find((item) => item.id === move.squadId);
    if (!squad) continue;
    if (!isActive(squad)) {
      barred(squad.id);
      continue;
    }
    if (isRelief(move)) {
      const tired = state.squads.find((item) => item.id === move.relieve);
      if (!tired || !isActive(tired) || hexDistance(tired.hex, squad.hex) !== 1) {
        barred(squad.id);
        continue;
      }
      const line = { ...tired.hex };
      const rear = { ...squad.hex };
      ctx.emit({ kind: "relieved", squadId: squad.id, relievedId: tired.id, hex: line });
      squad.hex = line;
      tired.hex = rear;
      ctx.emit({ kind: "mustered", squadId: squad.id, path: [rear, line], from: rear, to: line, halted: false });
      ctx.emit({ kind: "mustered", squadId: tired.id, path: [line, rear], from: line, to: rear, halted: false });
      continue;
    }
    // The path the player planned, from what it could see; walked on the true state.
    const planned = reach(knowledge(state, scenario, false), squad).get(hexKey(move.to));
    if (!planned) {
      barred(squad.id);
      continue;
    }
    const truth = knowledge(state, scenario, true);
    const path: HexCoord[] = [planned[0]];
    let halted = false;
    for (const hex of planned.slice(1)) {
      if (occupant(truth, hex)) {
        halted = true;
        break;
      }
      path.push(hex);
      if (stops(truth, hex) && !sameHex(hex, move.to)) {
        halted = true;
        break;
      }
    }
    if (path.length < 2) {
      barred(squad.id);
      continue;
    }
    squad.hex = { ...path[path.length - 1] };
    ctx.emit({ kind: "mustered", squadId: squad.id, path, from: path[0], to: path[path.length - 1], halted });
  }
}

/**
 * A muster applied to a copy of `state`, with its (unstamped) events. Pure. It resolves
 * on the true state, so it is for the engine and tests; a UI previews a muster from its
 * own planned moves (see validateMuster / musterOptions), never from this.
 */
export function applyMuster(state: EngineState, scenario: EngineScenario, moves: MusterMove[]): { state: EngineState; events: EventBody[] } {
  const next = structuredClone(state);
  const events: EventBody[] = [];
  const ctx = { state: next, scenario, emit: (event: EventBody) => events.push(event), phase: next.phase, beat: 0 } as unknown as EngineContext;
  executeMuster(ctx, moves);
  return { state: next, events };
}

// ---------------------------------------------------------------------------
// The balance harness's player-realistic muster (no hidden information).
// ---------------------------------------------------------------------------

/** Below this cohesion an engaged company is worth relieving; the relief must be at least FRESH. */
export const RELIEVE_BELOW = 35;
export const RELIEF_FRESH = 60;
/** A company with no seen enemy this close is idle and closes on the fight. */
export const IDLE_RANGE = 3;
/** In an escape battle with a column, an idle company closes on it when farther than this. */
export const WARD_RANGE = 2;

export type MusterPolicy = "none" | "heuristic" | "rush";

/**
 * A simple, sensible player: relieve any engaged company below RELIEVE_BELOW cohesion
 * with a fresh neighbour; then step idle fighting companies (not standards) toward the
 * fight (the nearest seen enemy; in an escape battle, the line of retreat, or the column if
 * one is more than WARD_RANGE away; nothing at all in an escape battle that has no column).
 * Reads only the player's view.
 */
export function heuristicMuster(state: EngineState, scenario: EngineScenario): MusterMove[] {
  const know = knowledge(state, scenario, false);
  const companies = [...know.own.values()].filter((squad) => !squad.noncombatant);
  const used = new Set<string>();
  const moves: MusterMove[] = [];

  const tired = companies
    .filter((squad) => squad.cohesion < RELIEVE_BELOW && inContact(state, squad))
    .sort((a, b) => a.cohesion - b.cohesion);
  for (const squad of tired) {
    const fresh = companies.find(
      (other) => !used.has(other.id) && other.cohesion >= RELIEF_FRESH && hexDistance(other.hex, squad.hex) === 1 && !inContact(state, other),
    );
    if (fresh && !used.has(squad.id)) {
      moves.push({ squadId: fresh.id, relieve: squad.id });
      used.add(fresh.id).add(squad.id);
      const line = squad.hex;
      squad.hex = fresh.hex;
      fresh.hex = line;
    }
  }

  const exits = exitHexesFor(scenario, scenario.playerFaction) ?? [];
  const hasColumn = scenario.squads.some((squad) => squad.faction === scenario.playerFaction && squad.noncombatant);
  const enemyHexes = know.enemies.map((enemy) => enemy.hex);
  for (const squad of companies) {
    // Standards stay where their doctrine put them (beside the line, or at the column's side).
    if (used.has(squad.id) || inContact(state, squad) || squad.role === "support") continue;
    // Idle: no seen enemy within IDLE_RANGE. Busy companies keep the places their doctrines chose.
    if (enemyHexes.length > 0 && Math.min(...enemyHexes.map((hex) => hexDistance(hex, squad.hex))) <= IDLE_RANGE) continue;
    // An escape battle with no column at all (an attack on the roads): stay put. The march
    // doctrine takes the roads itself, and a sensible player does not drag a rear guard off
    // its post. Keyed on the scenario, so a column battle is unchanged after its column escapes.
    if (exits.length > 0 && !hasColumn) continue;
    // An escape battle with a column: stay close to it (the doctrines handle the withdrawal).
    const wards = [...know.own.values()].filter((other) => other.noncombatant).map((other) => other.hex);
    let goals = exits.length > 0 ? exits : enemyHexes;
    if (exits.length > 0 && wards.length > 0) {
      if (Math.min(...wards.map((hex) => hexDistance(hex, squad.hex))) <= WARD_RANGE) continue;
      goals = wards;
    }
    if (goals.length === 0) continue;
    const distance = (hex: HexCoord) => Math.min(...goals.map((goal) => hexDistance(goal, hex)));
    const options = [...reach(know, squad).values()].map((path) => path[path.length - 1]);
    const best = options.sort((a, b) => distance(a) - distance(b))[0];
    if (best && distance(best) < distance(squad.hex)) {
      moves.push({ squadId: squad.id, to: best });
      used.add(squad.id);
      squad.hex = { ...best };
    }
  }
  return moves;
}

/**
 * An adversarial player (the harness's "rush" policy, C2): every command window, each listed
 * company out of contact steps as far as it can, by a known-clear path, toward the enemy
 * objectives still standing (in an escape battle, the line of retreat). By default every
 * fighting company rushes; standards and the Column stay. Front companies move first, so
 * the column does not block itself. Reads only the player's view; every move is valid.
 * It tests whether strength alone can skip part of a plan (gated for unfilled-role plans).
 */
export function rushMuster(state: EngineState, scenario: EngineScenario, squadIds?: readonly string[]): MusterMove[] {
  const know = knowledge(state, scenario, false);
  const exits = exitHexesFor(scenario, scenario.playerFaction) ?? [];
  const goals = exits.length > 0
    ? exits
    : state.objectives.filter((objective) => objective.defender !== scenario.playerFaction && objective.integrity > 0).map((objective) => objective.hex);
  if (goals.length === 0) return [];
  const distance = (hex: HexCoord) => Math.min(...goals.map((goal) => hexDistance(goal, hex)));
  const companies = [...know.own.values()]
    .filter((squad) => !squad.noncombatant && (squadIds ? squadIds.includes(squad.id) : squad.role !== "support"))
    .sort((a, b) => distance(a.hex) - distance(b.hex));
  const moves: MusterMove[] = [];
  for (const squad of companies) {
    if (inContact(state, squad)) continue;
    const options = [...reach(know, squad).values()].map((path) => path[path.length - 1]);
    const best = options.sort((a, b) => distance(a) - distance(b))[0];
    if (best && distance(best) < distance(squad.hex)) {
      moves.push({ squadId: squad.id, to: best });
      squad.hex = { ...best };
    }
  }
  return moves;
}
