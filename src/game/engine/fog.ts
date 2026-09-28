// Fog of war, sighting and renown & dread (tech plan §4a). The engine always
// resolves on the true state. Fog only changes (a) what the player's squads can
// base their rule conditions and targets on, and (b) what visibleState() reveals
// to the UI and renderer. The Host (non-player side) is omniscient for now.
// Everything here is inert when state.fortune is "off".
import { getHex, hexDistance, type HexCoord } from "../board";
import { checkRout, fortuneOn, type EngineContext, type RuleContext } from "./context";
import type { EngineSquad, EngineState, FactionId } from "./types";
import { enemiesOf, isActive, type ActiveSquad } from "./world";

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

/** In range, and no ruin hex strictly between the two (adjacent squads always see each other). */
export function canSee(ctx: RuleContext, observer: ActiveSquad, target: ActiveSquad): boolean {
  const distance = hexDistance(observer.hex, target.hex);
  if (distance > sightRange(ctx, observer)) {
    return false;
  }
  return hexLine(observer.hex, target.hex)
    .slice(1, -1)
    .every((hex) => getHex(ctx.scenario.board, hex)?.terrain !== "ruin");
}

/**
 * The enemies a squad may base its rule conditions and targets on: all of them for
 * an omniscient side (the Host, or anyone when fortune is off), otherwise only
 * those its faction currently has in sight.
 */
export function perceivedEnemies(ctx: RuleContext, squad: ActiveSquad): ActiveSquad[] {
  const enemies = enemiesOf(ctx.state, squad);
  if (!fortuneOn(ctx) || squad.faction !== ctx.scenario.playerFaction) {
    return enemies;
  }
  const intel = ctx.state.intel[squad.faction] ?? {};
  return enemies.filter((enemy) => intel[enemy.id]?.visible);
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
        if (known) {
          known.visible = false;
          known.status = enemy.status;
          known.hex = null;
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

/** Dread for every squad that can personally see a renowned enemy it has not yet faced. */
export function dreadFromSight(ctx: EngineContext) {
  if (!fortuneOn(ctx)) {
    return;
  }
  const renowned = ctx.state.squads.filter((squad): squad is ActiveSquad => isActive(squad) && Boolean(squad.renown));
  for (const source of renowned) {
    for (const viewer of ctx.state.squads) {
      if (isActive(viewer) && isActive(source) && viewer.faction !== source.faction && canSee(ctx, viewer, source)) {
        applyDread(ctx, viewer, source);
      }
    }
  }
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
