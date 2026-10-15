// The phase timeline (T06): a pure function from the player's projected events to
// ordered, timed playback steps, plus a pure reducer that advances what the board
// shows one step at a time. No React, no three.js, no timers: the director runs it.
import { getHex, hexDistance, hexNeighbors, type BoardLayout, type HexCoord } from "../../game/board";
import type { EngineEvent, FactionId, VisibleSquad, VisibleState } from "../../game/engine";
import { SURGE_COHESION } from "../../game/engine/fortune";
import { boardCenter, hexToWorld } from "../../render/hexWorld";

export type Pace = "readable" | "fast";

/** Fast plays every step in half the time. */
export const PACE_SCALE: Record<Pace, number> = { readable: 1, fast: 0.5 };

/**
 * A whole phase at Readable fits in its budget; longer phases are compressed to it. The
 * budget grows with the battle (T19 playtest: large battles cycled too fast): 24 s, plus
 * 2 s for each company acting in the phase beyond 8, up to 45 s. Fast is half.
 *
 * 45 s is a target, not a cap: readability wins, so no step is squeezed below MIN_SQUEEZE
 * of its natural length, and a very dense phase may run longer. PHASE_CEILING_MS is the
 * hard ceiling: past it the least important steps go first (the Host's repeat rule banners,
 * then the Host's moves, both become instant and caption-only), and only then is
 * everything squeezed to fit.
 */
export const PHASE_BUDGET_MS = 24_000;
export const PHASE_BUDGET_MAX_MS = 45_000;
export const BUDGET_PER_COMPANY_MS = 2_000;
export const BUDGET_FREE_COMPANIES = 8;
/** Compression never takes a step below this share of its natural (Readable) length. */
export const MIN_SQUEEZE = 0.55;
/** No Readable phase runs longer than this (Fast: half). */
export const PHASE_CEILING_MS = 60_000;

/** The Readable budget for a phase in which `companies` companies act. */
export function phaseBudgetMs(companies: number): number {
  return Math.min(PHASE_BUDGET_MAX_MS, PHASE_BUDGET_MS + BUDGET_PER_COMPANY_MS * Math.max(0, companies - BUDGET_FREE_COMPANIES));
}

/** The companies a phase's events involve (both sides, as the player saw them). */
export function actingCompanies(events: EngineEvent[]): number {
  const ids = new Set<string>();
  for (const event of events) {
    for (const key of ["squadId", "attackerId", "defenderId", "sourceId", "targetId"] as const) {
      const id = (event as Partial<Record<typeof key, unknown>>)[key];
      if (typeof id === "string") ids.add(id);
    }
  }
  return ids.size;
}

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
  /** The event's position in the projected stream (-1 for a beat marker). */
  index: number;
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
  /**
   * Moves: `path` split into stretches the player saw without a break. Between two
   * runs the squad passed through unseen hexes: it fades into the fog and reappears.
   */
  runs: HexCoord[][];
  /** Moves: the squad steps out of the fog at path[0] (its start was unseen). */
  emerges: boolean;
  /** Moves: the squad walks into the fog at the end of the path. */
  vanishes: boolean;
}

export interface Timeline {
  /** The Readable budget this phase was fitted to (phaseBudgetMs of its acting companies). */
  budgetMs: number;
  /** The uncompressed Readable length. */
  naturalMs: number;
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
  /** A move's pause in the fog between two stretches the player saw. */
  fogGap: 350,
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

function draft(
  event: EngineEvent,
  playerFaction: FactionId,
  factionOf: (id: string) => FactionId | undefined,
  lastRule: Map<string, string>,
  index: number,
): Draft | null {
  const plain = { beat: event.beat, event, index, repeat: false, quiet: false, path: [], runs: [], emerges: false, vanishes: false };
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
    case "move":
    case "mustered": {
      if (event.path.length === 0) {
        return null;
      }
      const emerges = event.from === null;
      const runs = visibleRuns(event.path);
      const legs = Math.max(1, runs.reduce((sum, run) => sum + run.length - 1, 0));
      return {
        ...plain,
        kind: "move",
        path: event.path.map((hex) => ({ ...hex })),
        runs,
        emerges,
        vanishes: event.to === null,
        base: STEP_MS.movePerHex * legs + (emerges ? STEP_MS.emerge : 0) + (runs.length - 1) * STEP_MS.fogGap,
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
    case "relieved":
      return null;
  }
}

/** Splits a projected path wherever consecutive hexes are not neighbours (unseen hexes were cut out). */
export function visibleRuns(path: HexCoord[]): HexCoord[][] {
  const runs: HexCoord[][] = [];
  for (const hex of path) {
    const run = runs[runs.length - 1];
    if (run && hexDistance(run[run.length - 1], hex) <= 1) {
      run.push({ ...hex });
    } else {
      runs.push([{ ...hex }]);
    }
  }
  return runs;
}

/**
 * The phase as timed steps, in the engine's own order (initiative side first in each
 * beat). A "Beat N" marker opens each beat. At Readable the whole phase is compressed
 * to its budget (phaseBudgetMs) if needed, but never below MIN_SQUEEZE of its natural
 * length; Fast halves every step.
 */
export function buildTimeline(
  events: EngineEvent[],
  pace: Pace,
  { playerFaction, factionOf }: { playerFaction: FactionId; factionOf: (id: string) => FactionId | undefined },
): Timeline {
  const drafts: Draft[] = [];
  const lastRule = new Map<string, string>();
  let beat = -1;
  for (const [index, event] of events.entries()) {
    const next = draft(event, playerFaction, factionOf, lastRule, index);
    if (!next) {
      continue;
    }
    if (event.beat > 0 && event.beat !== beat) {
      drafts.push({
        kind: "beat",
        beat: event.beat,
        event: null,
        index: -1,
        repeat: false,
        quiet: false,
        path: [],
        runs: [],
        emerges: false,
        vanishes: false,
        base: STEP_MS.beat,
        lingerBase: 0,
      });
    }
    beat = event.beat;
    drafts.push(next);
  }

  const natural = drafts.reduce((sum, item) => sum + item.base, 0);
  const budget = phaseBudgetMs(actingCompanies(events));
  const squeeze = natural > budget ? Math.max(MIN_SQUEEZE, budget / natural) : 1;
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
  const totalMs = fitCeiling(steps, PHASE_CEILING_MS * PACE_SCALE[pace], (id) => factionOf(id) === playerFaction);
  return { pace, steps, totalMs, budgetMs: budget, naturalMs: natural };
}

/**
 * Holds a phase to the hard ceiling (see PHASE_CEILING_MS). Lowest priority first: the
 * Host's repeat rules (already caption-only) take no time, then the Host's moves become
 * instant; if it still does not fit, every step shrinks evenly. Re-times `at`; returns the total.
 */
function fitCeiling(steps: Step[], ceiling: number, mine: (squadId: string) => boolean): number {
  let total = steps.reduce((sum, step) => sum + step.duration, 0);
  const squadOf = (step: Step) => (step.event && "squadId" in step.event ? step.event.squadId : null);
  const tiers: Array<(step: Step) => boolean> = [
    (step) => step.kind === "rule" && step.quiet,
    (step) => step.kind === "move" && squadOf(step) !== null && !mine(squadOf(step)!),
  ];
  for (const tier of tiers) {
    for (const step of steps) {
      if (total <= ceiling) break;
      if (!tier(step) || step.duration === 0) continue;
      total -= step.duration;
      step.duration = 0;
      step.linger = 0;
      step.quiet = true;
    }
  }
  if (total > ceiling) {
    const shrink = ceiling / total;
    for (const step of steps) step.duration = Math.floor(step.duration * shrink);
  }
  let at = 0;
  for (const step of steps) {
    step.at = at;
    at += step.duration;
  }
  return at;
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

/**
 * Where a squad that comes into view mid-phase comes from: its stats as they were at
 * that step (see snapshotBefore), keyed by squad and the step it appears on.
 */
export type Known = (id: string, step: Step) => VisibleSquad | undefined;

/**
 * Fallback for a squad the engine gave no sighting snapshot for: its phase-end view, with
 * every change the player witnessed after event `index` undone. Exact while the squad stays in sight to
 * the end of the phase; losses it took unseen between two sightings are not in the
 * projected stream (see the engine gap in the T14 report).
 */
export function snapshotBefore(final: VisibleSquad | undefined, events: EngineEvent[], index: number): VisibleSquad | undefined {
  if (!final) return undefined;
  let strength = final.strength;
  let cohesion = final.cohesion;
  for (const event of events.slice(index + 1)) {
    switch (event.kind) {
      case "engagement":
        strength -= event.strengthChanges[final.id] ?? 0;
        cohesion -= event.cohesionChanges[final.id] ?? 0;
        break;
      case "rally":
        if (event.targetId === final.id) cohesion -= event.restored;
        break;
      case "dread":
        if (event.squadId === final.id) cohesion += event.shock;
        break;
      case "fortune":
        if (event.squadId === final.id && event.outcome === "surge") cohesion -= SURGE_COHESION;
        break;
      default:
        break;
    }
  }
  return { ...final, strength: clamp(strength), cohesion: clamp(cohesion), status: "active", lastKnown: false };
}

/** A squad walking into the fog: a last-known ghost at `hex`, its doctrine hidden again. */
export function fadeIntoFog(view: VisibleState, id: string, hex: HexCoord): VisibleState {
  return mapSquad(view, id, (squad) => ({ ...squad, hex: { ...hex }, lastKnown: true, doctrineId: null }));
}

/** Brings a squad (back) into view at `hex`: a ghost reappears, a new squad emerges. */
export function comeIntoView(view: VisibleState, id: string, hex: HexCoord, step: Step, known: Known): VisibleState {
  return reveal(view, id, hex, step, known);
}

/** Adds a squad the player just laid eyes on (as it was at this step), or reveals a ghost. */
function reveal(view: VisibleState, id: string, hex: HexCoord, step: Step, known: Known): VisibleState {
  // The engine's sighting snapshot is exact; the reconstruction is the fallback.
  const seen = sightingSnapshot(step, id);
  const existing = view.squads.find((squad) => squad.id === id);
  if (existing) {
    return mapSquad(view, id, (squad) => ({ ...squad, ...(seen ?? {}), hex: { ...hex }, lastKnown: false, lastSeen: null, status: "active" }));
  }
  const info = seen ?? known(id, step);
  if (!info) {
    return view;
  }
  return { ...view, squads: [...view.squads, { ...info, hex: { ...hex }, status: "active", lastKnown: false, lastSeen: null }] };
}

/**
 * The squad as the player first saw it at this step: a `sighted` event's snapshot, or
 * the snapshot the projection attaches to an event that brings it into view.
 */
export function sightingSnapshot(step: Step, id: string): VisibleSquad | undefined {
  const event = step.event;
  if (!event) return undefined;
  const snapshot = event.kind === "sighted" && event.squadId === id ? event.snapshot : event.introduces?.find((item) => item.id === id);
  if (!snapshot) return undefined;
  return {
    ...snapshot,
    hex: snapshot.hex ? { ...snapshot.hex } : null,
    ...(snapshot.renown ? { renown: { title: snapshot.renown.title } } : {}),
    lastKnown: false,
    lastSeen: null,
  };
}

/**
 * The display after a step has played. Starts from the phase's opening view; after
 * the last step it matches the phase's outcome closely enough that swapping in the
 * final visibleState is seamless. `known` supplies squads that emerge mid-phase.
 */
export function applyStep(view: VisibleState, step: Step, known: Known): VisibleState {
  const event = step.event;
  if (!event) {
    return view;
  }
  switch (event.kind) {
    case "move":
    case "mustered": {
      const end = step.path[step.path.length - 1];
      let next = step.emerges || !view.squads.some((squad) => squad.id === event.squadId) ? reveal(view, event.squadId, step.path[0], step, known) : view;
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
      return reveal(view, event.squadId, event.hex, step, known);
    case "outcome":
      return { ...view, status: event.status };
    case "ruleFired":
    case "blocked":
    case "relieved":
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
 * null when every neighbour is closed: the squad breaks where it stands.
 */
export function routDirection(board: BoardLayout, hex: HexCoord, faction: FactionId): [number, number] | null {
  const home = homeDirection(faction);
  const center = boardCenter(board);
  const [ox, oz] = hexToWorld(hex, center);
  let best: [number, number] | null = null;
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
