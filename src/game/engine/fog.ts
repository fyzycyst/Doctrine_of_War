// Fog of war, sighting and renown & dread (tech plan §4a). The engine always
// resolves on the true state. Fog only changes (a) what the player's squads can
// base their rule conditions and targets on, and (b) what visibleState() reveals
// to the UI and renderer. The Host (non-player side) is omniscient for now.
// Everything here is inert when state.fortune is "off".
import { getHex, hexDistance, type HexCoord } from "../board";
import { checkRout, fortuneOn, type EngineContext, type RuleContext } from "./context";
import type { EngineSquad, EngineState, FactionId, SquadStatus } from "./types";
import { isActive, type ActiveSquad } from "./world";

export const BASE_SIGHT = 2;
export const RIDGE_SIGHT_BONUS = 1;
export const MIST_SIGHT_PENALTY = 1;
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

export function sightRange(ctx: RuleContext, observer: ActiveSquad): number {
  const ridge = getHex(ctx.scenario.board, observer.hex)?.terrain === "ridge" ? RIDGE_SIGHT_BONUS : 0;
  const mist = ctx.state.weather === "mist" ? MIST_SIGHT_PENALTY : 0;
  return Math.max(1, BASE_SIGHT + ridge - mist);
}

/** In range, and no ruin hex strictly between the two (neighbouring hexes are always seen). */
export function canSeeHex(ctx: RuleContext, observer: ActiveSquad, hex: HexCoord): boolean {
  const distance = hexDistance(observer.hex, hex);
  if (distance > sightRange(ctx, observer)) {
    return false;
  }
  return hexLine(observer.hex, hex)
    .slice(1, -1)
    .every((between) => getHex(ctx.scenario.board, between)?.terrain !== "ruin");
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
        emit?.({ kind: "sighted", faction, squadId: enemy.id, byId: spotter.id, hex: enemy.hex });
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
// What a faction is allowed to know
// ---------------------------------------------------------------------------

export interface VisibleSquad extends Omit<EngineSquad, "doctrineId"> {
  /** null for an enemy that is not in sight right now. */
  doctrineId: string | null;
  /** true: an enemy shown where it was last seen, with the stats it had then. */
  lastKnown: boolean;
}

export interface VisibleState extends Omit<EngineState, "squads" | "intel" | "rngState"> {
  viewer: FactionId;
  squads: VisibleSquad[];
}

/**
 * Pure fog-of-war filter for the UI and renderer. Own squads and enemies in sight
 * are shown as they are; enemies seen before appear at their last-known hex with
 * their doctrine hidden; enemies never seen are omitted. With fortune off, it
 * reveals everything.
 */
export function visibleState(state: EngineState, viewer: FactionId): VisibleState {
  const { intel: allIntel, rngState: _hidden, squads, ...rest } = state;
  const intel = allIntel[viewer] ?? {};
  const visible: VisibleSquad[] = [];

  for (const squad of squads) {
    const reveal = { ...squad, hex: squad.hex ? { ...squad.hex } : null, lastKnown: false };
    if (state.fortune === "off" || squad.faction === viewer) {
      visible.push(reveal);
      continue;
    }
    const known = intel[squad.id];
    if (!known) {
      continue;
    }
    if (known.visible) {
      visible.push(reveal);
    } else {
      visible.push({
        ...squad,
        hex: known.hex ? { ...known.hex } : null,
        strength: known.strength,
        cohesion: known.cohesion,
        status: known.status,
        doctrineId: null,
        braced: false,
        surging: false,
        lastKnown: true,
      });
    }
  }
  return { ...rest, viewer, squads: visible };
}
