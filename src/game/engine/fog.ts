// Fog of war, sighting and renown & dread (tech plan §4a). The engine always
// resolves on the true state. Fog only changes (a) what the player's squads can
// base their rule conditions and targets on, and (b) what visibleState() reveals
// to the UI and renderer. The Host (non-player side) is omniscient for now.
// Everything here is inert when state.fortune is "off".
import { boardNeighbors, getHex, hexDistance, type HexCoord } from "../board";
import { checkRout, fortuneOn, type EngineContext, type EventBody, type RuleContext } from "./context";
import type {
  EngineEvent,
  EngineScenario,
  EngineSquad,
  EngineState,
  FactionId,
  Redaction,
  RedactedActor,
  SquadStatus,
  Weather,
  TimeOfDay,
  SquadSnapshot,
} from "./types";
import { isActive, type ActiveSquad } from "./world";

export const BASE_SIGHT = 2;
export const RIDGE_SIGHT_BONUS = 1;
export const MIST_SIGHT_PENALTY = 1;
export const NIGHT_SIGHT_PENALTY = 1;
export const LIT_SIGHT_BONUS = 1;
/** Cohesion lost per point of Resolve the renowned squad has over the viewer. */
export const DREAD_PER_RESOLVE = 5;
export const ASH_WIND_DREAD_MULTIPLIER = 1.5;

function cubeRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }
  return { q: rq + 0, r: rr + 0 };
}

/** Hexes on the straight line from a to b, inclusive (standard cube lerp with a nudge). */
export function hexLine(a: HexCoord, b: HexCoord): HexCoord[] {
  const n = hexDistance(a, b);
  const line: HexCoord[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = n === 0 ? 0 : i / n;
    line.push(cubeRound(a.q + (b.q - a.q) * t + 1e-6, a.r + (b.r - a.r) * t + 1e-6));
  }
  return line;
}

/** Ruins and reed banks hide what lies behind them. */
export function blocksSight(terrain: string | undefined): boolean {
  return terrain === "ruin" || terrain === "reeds";
}

/** The hour in a given phase: `timeOfDayByPhase` overrides `timeOfDay` (default "day"). */
export function timeOfDayAt(scenario: EngineScenario, phase: number): TimeOfDay {
  return scenario.timeOfDayByPhase?.[phase] ?? scenario.timeOfDay ?? "day";
}

/** Dark hours close in the horizon: night, grey rain and the hour before dawn. */
function darkHour(timeOfDay: TimeOfDay): boolean {
  return timeOfDay === "nightFires" || timeOfDay === "rainGrey" || timeOfDay === "predawn";
}

/** Sight range of a squad standing on `hex` in this weather and hour (also used by the UI inspector). */
export function sightRangeAt(
  scenario: EngineScenario,
  weather: Weather,
  hex: HexCoord,
  timeOfDay: TimeOfDay = scenario.timeOfDay ?? "day",
): number {
  const ridge = getHex(scenario.board, hex)?.terrain === "ridge" ? RIDGE_SIGHT_BONUS : 0;
  const mist = weather === "mist" ? MIST_SIGHT_PENALTY : 0;
  const dark = darkHour(timeOfDay) ? NIGHT_SIGHT_PENALTY : 0;
  return Math.max(1, BASE_SIGHT + ridge - mist - dark);
}

export function sightRange(ctx: RuleContext, observer: ActiveSquad): number {
  return sightRangeAt(ctx.scenario, ctx.state.weather, observer.hex, ctx.state.timeOfDay);
}

/** At night, a squad on a ford or beside the burning river is lit and seen from 1 hex further. */
export function isLit(ctx: RuleContext, hex: HexCoord): boolean {
  if (ctx.state.timeOfDay !== "nightFires") {
    return false;
  }
  const here = getHex(ctx.scenario.board, hex)?.terrain;
  return here === "ford" || boardNeighbors(ctx.scenario.board, hex).some((neighbor) => neighbor.terrain === "river");
}

/**
 * In range (1 further if the hex is lit by the burning river), and no ruin hex strictly
 * between the two (neighbouring hexes are always seen).
 */
export function canSeeHex(ctx: RuleContext, observer: ActiveSquad, hex: HexCoord): boolean {
  const distance = hexDistance(observer.hex, hex);
  if (distance > sightRange(ctx, observer) + (isLit(ctx, hex) ? LIT_SIGHT_BONUS : 0)) {
    return false;
  }
  return hexLine(observer.hex, hex)
    .slice(1, -1)
    .every((between) => !blocksSight(getHex(ctx.scenario.board, between)?.terrain));
}

export function canSee(ctx: RuleContext, observer: ActiveSquad, target: ActiveSquad): boolean {
  return canSeeHex(ctx, observer, target.hex);
}

/** Whether any active squad of `faction` can see `hex` right now. */
export function factionSees(ctx: RuleContext, faction: FactionId, hex: HexCoord): boolean {
  return ctx.state.squads.some(
    (squad) => squad.faction === faction && isActive(squad) && canSeeHex(ctx, squad, hex),
  );
}

/**
 * A squad leaves the board (rout, destruction, escape) at `hex`. Each opposing side
 * that can see that hex learns it; the others keep their last-known silhouette.
 */
export function observeDeparture(ctx: RuleContext, squad: EngineSquad, hex: HexCoord, status: SquadStatus) {
  if (!fortuneOn(ctx)) {
    return;
  }
  for (const faction of factions(ctx.state)) {
    if (faction === squad.faction || !factionSees(ctx, faction, hex)) {
      continue;
    }
    const intel = (ctx.state.intel[faction] ??= {});
    intel[squad.id] = {
      ...(intel[squad.id] ?? { strength: squad.strength, cohesion: squad.cohesion, phase: ctx.state.phase, beat: 0 }),
      visible: false,
      hex: null,
      status,
    };
  }
}

function factions(state: EngineState): FactionId[] {
  return [...new Set(state.squads.map((squad) => squad.faction))];
}

/** Recomputes each faction's intel. Emits `sighted` when an enemy comes into view (if emit is given). */
export function refreshIntel(ctx: RuleContext, emit?: EngineContext["emit"], beat = 0, phase = ctx.state.phase) {
  if (!fortuneOn(ctx)) {
    return;
  }
  const { state } = ctx;
  for (const faction of factions(state)) {
    const intel = (state.intel[faction] ??= {});
    const observers = state.squads.filter((squad): squad is ActiveSquad => squad.faction === faction && isActive(squad));

    for (const enemy of state.squads) {
      if (enemy.faction === faction) {
        continue;
      }
      const known = intel[enemy.id];
      if (!isActive(enemy)) {
        // Gone from the board. Only an observed departure (observeDeparture) updates
        // status and position; an unseen rout leaves the last-known silhouette.
        if (known) {
          known.visible = false;
        }
        continue;
      }
      const spotter = observers.find((observer) => canSee(ctx, observer, enemy));
      if (!spotter) {
        if (known) {
          known.visible = false;
        }
        continue;
      }
      if (!known?.visible) {
        emit?.({ kind: "sighted", faction, squadId: enemy.id, byId: spotter.id, hex: enemy.hex, snapshot: snapshotOf(enemy) });
      }
      intel[enemy.id] = {
        visible: true,
        hex: { ...enemy.hex },
        strength: enemy.strength,
        cohesion: enemy.cohesion,
        status: enemy.status,
        phase,
        beat,
      };
    }
  }
}

/** One-time cohesion shock when `viewer` first sights or engages the renowned `source`. */
export function applyDread(ctx: EngineContext, viewer: EngineSquad, source: EngineSquad) {
  if (!fortuneOn(ctx) || !source.renown || viewer.faction === source.faction || viewer.status !== "active") {
    return;
  }
  const key = `${viewer.id}>${source.id}`;
  if (ctx.state.dreaded.includes(key)) {
    return;
  }
  ctx.state.dreaded.push(key);
  const ashWind = ctx.state.weather === "ashWind" && source.faction === "ashen_host";
  const shock = Math.round(
    Math.max(0, source.resolve - viewer.resolve) * DREAD_PER_RESOLVE * (ashWind ? ASH_WIND_DREAD_MULTIPLIER : 1),
  );
  if (shock <= 0) {
    return;
  }
  viewer.cohesion = Math.max(0, viewer.cohesion - shock);
  ctx.emit({ kind: "dread", squadId: viewer.id, sourceId: source.id, title: source.renown.title, shock });
  checkRout(ctx, viewer);
}

/**
 * Dread for every squad that can personally see a renowned enemy it has not yet faced.
 * Returns true if any squad routed (so the caller must refresh intel).
 */
export function dreadFromSight(ctx: EngineContext): boolean {
  if (!fortuneOn(ctx)) {
    return false;
  }
  const activeBefore = ctx.state.squads.filter(isActive).length;
  const renowned = ctx.state.squads.filter((squad): squad is ActiveSquad => isActive(squad) && Boolean(squad.renown));
  for (const source of renowned) {
    for (const viewer of ctx.state.squads) {
      if (isActive(viewer) && isActive(source) && viewer.faction !== source.faction && canSee(ctx, viewer, source)) {
        applyDread(ctx, viewer, source);
      }
    }
  }
  return ctx.state.squads.filter(isActive).length < activeBefore;
}

// ---------------------------------------------------------------------------
// Who witnessed an event
// ---------------------------------------------------------------------------

/**
 * Who witnesses `event` at the moment it happens, and what each witness missed.
 * The acting side always sees its own events; the other side sees one only if it
 * can see where it happened (for a move, any hex of the path). Both sides of an
 * engagement see it (they are adjacent, and neighbours always see each other).
 * Objective damage is always known to the defender. Weather and outcomes are
 * public; a sighting belongs to the side that made it. Fortune off: all see all.
 */
export function witnessEvent(
  ctx: RuleContext,
  event: EventBody,
): { visibleTo: FactionId[]; redactions?: Partial<Record<FactionId, Redaction>> } {
  const everyone = factions(ctx.state);
  if (!fortuneOn(ctx)) {
    return { visibleTo: everyone };
  }
  // Raw events always carry actor ids; they only become null in projections.
  const factionOf = (squadId: string | null) => ctx.state.squads.find((squad) => squad.id === squadId)?.faction;
  const hexOf = (squadId: string | null) => ctx.state.squads.find((squad) => squad.id === squadId)?.hex ?? null;
  const witnessed = (owners: (FactionId | undefined)[], hexes: (HexCoord | null)[]) =>
    everyone.filter(
      (faction) => owners.includes(faction) || hexes.some((hex) => hex !== null && factionSees(ctx, faction, hex)),
    );

  let visibleTo: FactionId[];
  switch (event.kind) {
    case "outcome":
    case "weatherShift":
      visibleTo = everyone;
      break;
    case "sighted":
      visibleTo = [event.faction];
      break;
    case "ruleFired":
    case "blocked":
    case "fortune":
      visibleTo = witnessed([factionOf(event.squadId)], [hexOf(event.squadId)]);
      break;
    case "move":
      visibleTo = witnessed([factionOf(event.squadId)], event.path);
      break;
    case "rout":
    case "exit":
      visibleTo = witnessed([factionOf(event.squadId)], [event.hex]);
      break;
    case "engagement":
      visibleTo = witnessed([factionOf(event.attackerId), factionOf(event.defenderId)], [event.attackerHex, event.defenderHex]);
      break;
    case "rally":
      visibleTo = witnessed([factionOf(event.sourceId)], [hexOf(event.sourceId), hexOf(event.targetId)]);
      break;
    case "objectiveDamage": {
      const defender = ctx.state.objectives.find((objective) => objective.id === event.objectiveId)?.defender;
      visibleTo = witnessed([factionOf(event.attackerId), defender], [event.hex]);
      break;
    }
    case "dread":
      visibleTo = witnessed([factionOf(event.squadId)], [hexOf(event.squadId)]);
      break;
  }

  const redactions: Partial<Record<FactionId, Redaction>> = {};
  // Enemies an event shows a faction for the first time: not in its sight before this.
  const actorIds = (): string[] => {
    switch (event.kind) {
      case "engagement":
        return [event.attackerId, event.defenderId];
      case "rally":
        return [event.sourceId, event.targetId].filter((id): id is string => id !== null);
      case "objectiveDamage":
        return event.attackerId ? [event.attackerId] : [];
      case "dread":
        return [event.squadId, ...(event.sourceId ? [event.sourceId] : [])];
      case "ruleFired":
      case "blocked":
      case "fortune":
      case "move":
      case "rout":
      case "exit":
        return [event.squadId];
      default:
        return [];
    }
  };
  const actorSeen = (faction: FactionId, squadId: string | null) => {
    if (squadId === null || factionOf(squadId) === faction) {
      return true;
    }
    const hex = hexOf(squadId);
    return hex !== null && factionSees(ctx, faction, hex);
  };
  const hide = (faction: FactionId, actor: RedactedActor) => {
    const current = redactions[faction] ?? {};
    redactions[faction] = { ...current, hidden: [...(current.hidden ?? []), actor] };
  };
  for (const faction of visibleTo) {
    const intel = ctx.state.intel[faction] ?? {};
    const introduces = actorIds()
      .map((id) => ctx.state.squads.find((squad) => squad.id === id))
      .filter(
        (squad): squad is EngineSquad =>
          squad !== undefined &&
          squad.faction !== faction &&
          squad.hex !== null &&
          !intel[squad.id]?.visible &&
          factionSees(ctx, faction, squad.hex),
      )
      .map(snapshotOf);
    if (introduces.length > 0) {
      redactions[faction] = { ...redactions[faction], introduces };
    }
    // Audit of actor fields by kind. ruleFired/blocked/fortune/move/rout/exit are only
    // witnessed by a side that saw their one actor; engagements are between neighbours,
    // who always see each other; sightings belong to the observer. The rest can be
    // witnessed while an actor stays hidden:
    if (event.kind === "objectiveDamage" && !actorSeen(faction, event.attackerId)) {
      hide(faction, "attackerId");
    }
    if (event.kind === "rally") {
      if (!actorSeen(faction, event.sourceId)) hide(faction, "sourceId");
      if (!actorSeen(faction, event.targetId)) hide(faction, "targetId");
    }
    if (event.kind === "dread" && !actorSeen(faction, event.sourceId)) {
      hide(faction, "sourceId");
    }
    if (event.kind === "move" && factionOf(event.squadId) !== faction) {
      const pathSeen = event.path.map((hex) => factionSees(ctx, faction, hex));
      if (pathSeen.some((seen) => !seen)) {
        redactions[faction] = { ...redactions[faction], pathSeen };
      }
    }
  }
  return Object.keys(redactions).length > 0 ? { visibleTo, redactions } : { visibleTo };
}

/** A copy of `event` as `faction` witnessed it: unseen parts removed, visibility metadata stripped. */
export function projectEvent(event: EngineEvent, faction: FactionId): EngineEvent {
  const { redactions, visibleTo: _all, ...rest } = structuredClone(event);
  const projected = { ...rest, visibleTo: [faction] } as EngineEvent;
  const redaction = redactions?.[faction];
  for (const actor of redaction?.hidden ?? []) {
    if (actor === "attackerId" && projected.kind === "objectiveDamage") {
      projected.attackerId = null;
    }
    if (actor === "sourceId" && (projected.kind === "rally" || projected.kind === "dread")) {
      projected.sourceId = null;
    }
    if (actor === "targetId" && projected.kind === "rally") {
      projected.targetId = null;
    }
  }
  if (redaction?.introduces) {
    projected.introduces = redaction.introduces;
  }
  if (redaction?.pathSeen && projected.kind === "move") {
    const seen = redaction.pathSeen;
    projected.from = seen[0] ? projected.from : null;
    projected.to = seen[seen.length - 1] ? projected.to : null;
    projected.path = projected.path.filter((_, index) => seen[index]);
  }
  return projected;
}

/**
 * The event stream as `faction` experienced it: only the events it witnessed, each
 * projected to what it saw. Playback and reports use this, never the raw stream.
 */
export function eventsFor(events: EngineEvent[], faction: FactionId): EngineEvent[] {
  return events.filter((event) => event.visibleTo.includes(faction)).map((event) => projectEvent(event, faction));
}

// ---------------------------------------------------------------------------
// What a faction is allowed to know
// ---------------------------------------------------------------------------

/** The UI-safe view of one squad. Fields are copied by name: nothing else leaks. */
export interface VisibleSquad {
  id: string;
  name: string;
  faction: FactionId;
  role: EngineSquad["role"];
  hex: HexCoord | null;
  strength: number;
  cohesion: number;
  resolve: number;
  /** null for an enemy that is not in sight right now. */
  doctrineId: string | null;
  status: SquadStatus;
  braced: boolean;
  surging: boolean;
  renown?: { title: string };
  noncombatant?: boolean;
  /** true: an enemy shown where it was last seen, with the stats it had then. */
  lastKnown: boolean;
  /** For enemies under fog: when they were last in sight. null for own squads, or with fortune off. */
  lastSeen: { phase: number; beat: number } | null;
}

/** The UI-safe view of a battle. An explicit allowlist: no rng, intel, contacts or dread bookkeeping. */
export interface VisibleState {
  viewer: FactionId;
  scenarioId: string;
  phase: number;
  maxPhases: number;
  status: EngineState["status"];
  fortune: EngineState["fortune"];
  seed: number;
  weather: EngineState["weather"];
  timeOfDay: EngineState["timeOfDay"];
  objectives: EngineState["objectives"];
  squads: VisibleSquad[];
}

/** A squad's in-sight fields at this moment (the same allowlist as VisibleSquad). */
export function snapshotOf(squad: EngineSquad): SquadSnapshot {
  const { lastKnown: _lastKnown, lastSeen: _lastSeen, ...fields } = showSquad(squad);
  return { ...fields, doctrineId: squad.doctrineId };
}

function showSquad(squad: EngineSquad, overrides: Partial<VisibleSquad> = {}): VisibleSquad {
  return {
    id: squad.id,
    name: squad.name,
    faction: squad.faction,
    role: squad.role,
    hex: squad.hex ? { ...squad.hex } : null,
    strength: squad.strength,
    cohesion: squad.cohesion,
    resolve: squad.resolve,
    doctrineId: squad.doctrineId,
    status: squad.status,
    braced: squad.braced,
    surging: squad.surging,
    ...(squad.renown ? { renown: { title: squad.renown.title } } : {}),
    ...(squad.noncombatant ? { noncombatant: true } : {}),
    lastKnown: false,
    lastSeen: null,
    ...overrides,
  };
}

/**
 * The hexes `faction` can see right now (for the fog-mist renderer). With fortune
 * off there is no fog, so every hex is visible.
 */
export function visibleHexes(state: EngineState, scenario: EngineScenario, faction: FactionId): HexCoord[] {
  const ctx = { state, scenario };
  return scenario.board.hexes
    .filter((hex) => state.fortune === "off" || factionSees(ctx, faction, hex.coord))
    .map((hex) => ({ ...hex.coord }));
}

/**
 * Pure fog-of-war filter for the UI and renderer. Own squads and enemies in sight
 * are shown as they are; enemies seen before appear at their last-known hex with
 * their doctrine hidden; enemies never seen are omitted. With fortune off, it
 * reveals everything.
 */
export function visibleState(state: EngineState, viewer: FactionId): VisibleState {
  const intel = state.intel[viewer] ?? {};
  const squads: VisibleSquad[] = [];

  for (const squad of state.squads) {
    if (state.fortune === "off" || squad.faction === viewer) {
      squads.push(showSquad(squad));
      continue;
    }
    const known = intel[squad.id];
    if (!known) {
      continue;
    }
    const lastSeen = { phase: known.phase, beat: known.beat };
    squads.push(
      known.visible
        ? showSquad(squad, { lastSeen })
        : showSquad(squad, {
            lastSeen,
            hex: known.hex ? { ...known.hex } : null,
            strength: known.strength,
            cohesion: known.cohesion,
            status: known.status,
            doctrineId: null,
            braced: false,
            surging: false,
            lastKnown: true,
          }),
    );
  }

  return {
    viewer,
    scenarioId: state.scenarioId,
    phase: state.phase,
    maxPhases: state.maxPhases,
    status: state.status,
    fortune: state.fortune,
    seed: state.seed,
    weather: state.weather,
    timeOfDay: state.timeOfDay,
    objectives: state.objectives.map((objective) => ({ ...objective, hex: { ...objective.hex } })),
    squads,
  };
}
