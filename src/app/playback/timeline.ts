// The phase timeline (T06): a pure function from the player's projected events to
// ordered, timed playback steps, plus a pure reducer that advances what the board
// shows one step at a time. No React, no three.js, no timers: the director runs it.
import { getHex, hexNeighbors, type BoardLayout, type HexCoord } from "../../game/board";
import type { EngineEvent, FactionId, VisibleSquad, VisibleState } from "../../game/engine";
import { SURGE_COHESION } from "../../game/engine/fortune";
import { boardCenter, hexToWorld } from "../../render/hexWorld";

export type Pace = "readable" | "fast";

/** Fast plays every step in half the time. */
export const PACE_SCALE: Record<Pace, number> = { readable: 1, fast: 0.5 };

/** A whole phase at Readable fits in this; longer phases are compressed to it. */
export const PHASE_BUDGET_MS = 24_000;

export type StepKind =
  | "beat"
  | "rule"
  | "move"
  | "clash"
  | "rally"
  | "rout"
  | "exit"
  | "fortune"
  | "dread"
  | "siege"
  | "weather"
  | "sighted"
  | "outcome";

export interface Step {
  kind: StepKind;
  beat: number;
  /** null for a beat marker. */
  event: EngineEvent | null;
  /** Start time in ms from the beginning of the phase (pace applied). */
  at: number;
  /** ms until the next step starts (pace applied). */
  duration: number;
  /** ms a callout stays up (pace applied); 0 = no callout. */
  linger: number;
  /** A rule the squad already showed this phase: a small callout, a quick step. */
  repeat: boolean;
  /** Caption only, no callout: a Host squad's later firings in the phase. */
  quiet: boolean;
  /** Moves: the hexes to march through, clipped to what the player saw. */
  path: HexCoord[];
  /** Moves: the squad steps out of the fog at path[0] (its start was unseen). */
  emerges: boolean;
  /** Moves: the squad walks into the fog at the end of the path. */
  vanishes: boolean;
}

export interface Timeline {
  pace: Pace;
  steps: Step[];
  totalMs: number;
}

/** Readable-pace step lengths (ms) before budget compression. */
export const STEP_MS = {
  beat: 450,
  ruleMine: 850,
  ruleTheirs: 600,
  ruleRepeat: 300,
  movePerHex: 420,
  emerge: 250,
  clash: 1150,
  charge: 250,
  rally: 800,
  rout: 1300,
  exit: 800,
  fortune: 1000,
  dread: 1100,
  siege: 1000,
  weather: 1400,
  sighted: 350,
  outcome: 700,
} as const;

/** Readable-pace callout lifetimes (ms). Not compressed: callouts must stay legible. */
export const LINGER_MS = {
  rule: 1200,
  ruleRepeat: 700,
  fortune: 1500,
  dread: 1700,
  siege: 1300,
  weather: 2200,
  rout: 1200,
  rally: 1000,
  sighted: 900,
} as const;

/** Callouts at Fast linger a little over half as long. */
const LINGER_SCALE: Record<Pace, number> = { readable: 1, fast: 0.6 };

type Draft = Omit<Step, "at" | "duration" | "linger"> & { base: number; lingerBase: number };

function draft(event: EngineEvent, playerFaction: FactionId, factionOf: (id: string) => FactionId | undefined, lastRule: Map<string, string>): Draft | null {
  const plain = { beat: event.beat, event, repeat: false, quiet: false, path: [], emerges: false, vanishes: false };
  switch (event.kind) {
    case "ruleFired": {
      const firstThisPhase = !lastRule.has(event.squadId);
      const repeat = lastRule.get(event.squadId) === event.ruleId;
      lastRule.set(event.squadId, event.ruleId);
      const mine = factionOf(event.squadId) === playerFaction;
      // The Host gets one callout per squad per phase; its later firings go to the caption bar.
      const quiet = !mine && !firstThisPhase;
      return {
        ...plain,
        kind: "rule",
        repeat: repeat || quiet,
        quiet,
        base: repeat ? STEP_MS.ruleRepeat : mine ? STEP_MS.ruleMine : STEP_MS.ruleTheirs,
        lingerBase: quiet ? 0 : repeat ? LINGER_MS.ruleRepeat : LINGER_MS.rule,
      };
    }
    case "move": {
      if (event.path.length === 0) {
        return null;
      }
      const emerges = event.from === null;
      const legs = Math.max(1, event.path.length - 1);
      return {
        ...plain,
        kind: "move",
        path: event.path.map((hex) => ({ ...hex })),
        emerges,
        vanishes: event.to === null,
        base: STEP_MS.movePerHex * legs + (emerges ? STEP_MS.emerge : 0),
        lingerBase: 0,
      };
    }
    case "engagement":
      return { ...plain, kind: "clash", base: STEP_MS.clash + (event.charge ? STEP_MS.charge : 0), lingerBase: 0 };
    case "rally":
      return { ...plain, kind: "rally", base: STEP_MS.rally, lingerBase: LINGER_MS.rally };
    case "rout":
      return { ...plain, kind: "rout", base: STEP_MS.rout, lingerBase: LINGER_MS.rout };
    case "exit":
      return { ...plain, kind: "exit", base: STEP_MS.exit, lingerBase: 0 };
    case "fortune":
      return { ...plain, kind: "fortune", base: STEP_MS.fortune, lingerBase: LINGER_MS.fortune };
    case "dread":
      return { ...plain, kind: "dread", base: STEP_MS.dread, lingerBase: LINGER_MS.dread };
    case "objectiveDamage":
      return { ...plain, kind: "siege", base: STEP_MS.siege, lingerBase: LINGER_MS.siege };
    case "weatherShift":
      return { ...plain, kind: "weather", base: STEP_MS.weather, lingerBase: LINGER_MS.weather };
    case "sighted":
      return { ...plain, kind: "sighted", base: STEP_MS.sighted, lingerBase: LINGER_MS.sighted };
    case "outcome":
      return { ...plain, kind: "outcome", base: STEP_MS.outcome, lingerBase: 0 };
    case "blocked":
      return null;
  }
}

/**
 * The phase as timed steps, in the engine's own order (initiative side first in each
 * beat). A "Beat N" marker opens each beat. At Readable the whole phase is compressed
 * to PHASE_BUDGET_MS if needed; Fast halves every step.
 */
export function buildTimeline(
  events: EngineEvent[],
  pace: Pace,
  { playerFaction, factionOf }: { playerFaction: FactionId; factionOf: (id: string) => FactionId | undefined },
): Timeline {
  const drafts: Draft[] = [];
  const lastRule = new Map<string, string>();
  let beat = -1;
  for (const event of events) {
    const next = draft(event, playerFaction, factionOf, lastRule);
    if (!next) {
      continue;
    }
    if (event.beat > 0 && event.beat !== beat) {
      drafts.push({ kind: "beat", beat: event.beat, event: null, repeat: false, quiet: false, path: [], emerges: false, vanishes: false, base: STEP_MS.beat, lingerBase: 0 });
    }
    beat = event.beat;
    drafts.push(next);
  }

  const natural = drafts.reduce((sum, item) => sum + item.base, 0);
  const squeeze = natural > PHASE_BUDGET_MS ? PHASE_BUDGET_MS / natural : 1;
  const scale = squeeze * PACE_SCALE[pace];
  let at = 0;
  const steps = drafts.map(({ base, lingerBase, ...rest }) => {
    const step: Step = {
      ...rest,
      at,
      // Floor, so rounding can never push a squeezed phase past its budget.
      duration: Math.floor(base * scale),
      linger: Math.round(lingerBase * LINGER_SCALE[pace]),
    };
    at += step.duration;
    return step;
  });
  return { pace, steps, totalMs: at };
}

// ---------------------------------------------------------------------------
// What the board shows, step by step
// ---------------------------------------------------------------------------

const clamp = (value: number) => Math.max(0, Math.min(100, value));

function mapSquad(view: VisibleState, id: string | null, change: (squad: VisibleSquad) => VisibleSquad): VisibleState {
  if (!id || !view.squads.some((squad) => squad.id === id)) {
    return view;
  }
  return { ...view, squads: view.squads.map((squad) => (squad.id === id ? change(squad) : squad)) };
}

/** Adds a squad the player just laid eyes on (from the phase's final view), or reveals a ghost. */
function reveal(view: VisibleState, id: string, hex: HexCoord, known: (id: string) => VisibleSquad | undefined): VisibleState {
  const existing = view.squads.find((squad) => squad.id === id);
  if (existing) {
    return mapSquad(view, id, (squad) => ({ ...squad, hex: { ...hex }, lastKnown: false, status: "active" }));
  }
  const info = known(id);
  if (!info) {
    return view;
  }
  return { ...view, squads: [...view.squads, { ...info, hex: { ...hex }, status: "active", lastKnown: false }] };
}

/**
 * The display after a step has played. Starts from the phase's opening view; after
 * the last step it matches the phase's outcome closely enough that swapping in the
 * final visibleState is seamless. `known` supplies squads that emerge mid-phase.
 */
export function applyStep(view: VisibleState, step: Step, known: (id: string) => VisibleSquad | undefined): VisibleState {
  const event = step.event;
  if (!event) {
    return view;
  }
  switch (event.kind) {
    case "move": {
      const end = step.path[step.path.length - 1];
      let next = step.emerges || !view.squads.some((squad) => squad.id === event.squadId) ? reveal(view, event.squadId, step.path[0], known) : view;
      next = mapSquad(next, event.squadId, (squad) => ({
        ...squad,
        hex: { ...end },
        ...(step.vanishes ? { lastKnown: true, doctrineId: null } : {}),
      }));
      return next;
    }
    case "engagement": {
      let next = view;
      for (const id of Object.keys({ ...event.strengthChanges, ...event.cohesionChanges })) {
        next = mapSquad(next, id, (squad) => ({
          ...squad,
          strength: clamp(squad.strength + (event.strengthChanges[id] ?? 0)),
          cohesion: clamp(squad.cohesion + (event.cohesionChanges[id] ?? 0)),
        }));
      }
      return next;
    }
    case "rally":
      return mapSquad(view, event.targetId, (squad) => ({ ...squad, cohesion: clamp(squad.cohesion + event.restored) }));
    case "rout":
      return mapSquad(view, event.squadId, (squad) => ({
        ...squad,
        status: event.cause === "strength" ? "destroyed" : "routed",
        hex: null,
        ...(event.cause === "strength" ? { strength: 0 } : { cohesion: 0 }),
      }));
    case "exit":
      return mapSquad(view, event.squadId, (squad) => ({ ...squad, status: "escaped", hex: null }));
    case "fortune":
      return event.outcome === "surge"
        ? mapSquad(view, event.squadId, (squad) => ({ ...squad, surging: true, cohesion: clamp(squad.cohesion + SURGE_COHESION) }))
        : view;
    case "dread":
      return mapSquad(view, event.squadId, (squad) => ({ ...squad, cohesion: clamp(squad.cohesion - event.shock) }));
    case "objectiveDamage":
      return {
        ...view,
        objectives: view.objectives.map((objective) =>
          objective.id === event.objectiveId ? { ...objective, integrity: event.newIntegrity } : objective,
        ),
      };
    case "weatherShift":
      return { ...view, weather: event.to };
    case "sighted":
      return reveal(view, event.squadId, event.hex, known);
    case "outcome":
      return { ...view, status: event.status };
    case "ruleFired":
    case "blocked":
      return view;
  }
}

/** Where a faction's home lies, as a world (x, z) direction: Host west, Banners east. */
export function homeDirection(faction: FactionId): [number, number] {
  return faction === "ashen_host" ? [-1, 0] : [1, 0];
}

/**
 * The direction a routing squad scatters: the open neighbouring hex that points most
 * toward its home side. Walls and deep river are never chosen, so the Banners never
 * flee into their own gate; off-board edges are fine (they run off the island).
 */
export function routDirection(board: BoardLayout, hex: HexCoord, faction: FactionId): [number, number] {
  const home = homeDirection(faction);
  const center = boardCenter(board);
  const [ox, oz] = hexToWorld(hex, center);
  let best: [number, number] = home;
  let bestScore = -Infinity;
  for (const neighbour of hexNeighbors(hex)) {
    const terrain = getHex(board, neighbour)?.terrain;
    if (terrain === "wall" || terrain === "river") {
      continue;
    }
    const [nx, nz] = hexToWorld(neighbour, center);
    const length = Math.hypot(nx - ox, nz - oz) || 1;
    const dir: [number, number] = [(nx - ox) / length, (nz - oz) / length];
    const score = dir[0] * home[0] + dir[1] * home[1];
    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  return best;
}
