import { hexDistance, type BoardLayout, type HexCoord } from "../game/board";
import type { SquadSetup, TimeOfDay as EngineTimeOfDay, Weather } from "../game/engine/types";
import type { DioramaVisibility } from "./Diorama";
import type { DioramaSquad } from "./figures/types";
import type { TimeOfDay, WeatherKind } from "./skins/types";

/**
 * Pure mapping from the engine's scenario/state shapes to what the Diorama
 * draws. Type-only engine imports: the renderer never runs engine logic.
 */

/** The engine's semantic time of day → the skin's lighting preset key. */
export function lightingFor(timeOfDay: EngineTimeOfDay | undefined): TimeOfDay {
  return timeOfDay === "nightFires" ? "nightFires" : "dusk";
}

/** Engine weather → skin weather overlay (same names today; kept as a seam). */
export function weatherFor(weather: Weather | undefined): WeatherKind {
  return weather ?? "clear";
}

/** Squads face the enemy: the Banners west, the Host east. */
export function facingFor(faction: SquadSetup["faction"]): number {
  return faction === "free_banners" ? Math.PI : 0;
}

type SquadLike = Pick<SquadSetup, "id" | "faction" | "hex" | "strength" | "cohesion" | "renown"> & {
  /** VisibleSquad.lastKnown: an enemy drawn where it was last seen (a ghost). */
  lastKnown?: boolean;
};

export function dioramaSquads(squads: SquadLike[]): DioramaSquad[] {
  return squads.map((s) => ({
    id: s.id,
    faction: s.faction,
    hex: s.hex,
    strength: s.strength,
    cohesion: s.cohesion,
    facing: facingFor(s.faction),
    renowned: !!s.renown,
    lastKnown: !!s.lastKnown,
  }));
}

/** Minimal shape of the engine's VisibleState that the fog adapter reads. */
export interface VisibleStateLike {
  viewer: SquadSetup["faction"];
  fortune: "on" | "off";
  weather: Weather;
  squads: Array<{
    id: string;
    faction: SquadSetup["faction"];
    hex: HexCoord | null;
    status: string;
    strength: number;
    cohesion: number;
    lastKnown: boolean;
  }>;
}

/**
 * Fog-of-war input for `<Diorama visibility>`, from the player's VisibleState.
 * Returns undefined when nothing is hidden (fortune off).
 *
 * ADAPTER: until the engine exports `visibleHexes(state, faction)`, the seen
 * hexes are approximated here from the documented sight rule (docs/ENGINE.md:
 * 2 hexes, +1 on a ridge, -1 in mist, -1 at night, minimum 1; ruins blocking
 * sight and lit fords are not modelled). When it lands, replace the
 * `approximateVisibleHexes(...)` call with the engine's result.
 */
export function visibilityFromView(
  view: VisibleStateLike,
  scenario: { board: BoardLayout; timeOfDay?: EngineTimeOfDay },
): DioramaVisibility | undefined {
  if (view.fortune === "off") return undefined;
  const visibleHexes = approximateVisibleHexes(view, scenario);
  const lastKnown = view.squads
    .filter((s) => s.lastKnown && s.hex && s.status === "active")
    .map((s) => ({ squadId: s.id, hex: s.hex!, faction: s.faction, strength: s.strength, cohesion: s.cohesion }));
  return { visibleHexes, lastKnown };
}

function approximateVisibleHexes(view: VisibleStateLike, scenario: { board: BoardLayout; timeOfDay?: EngineTimeOfDay }): HexCoord[] {
  const own = view.squads.filter((s) => s.faction === view.viewer && s.status === "active" && s.hex);
  const terrainAt = new Map(scenario.board.hexes.map((h) => [`${h.coord.q},${h.coord.r}`, h.terrain]));
  const sightAt = (hex: HexCoord) => {
    const ridge = terrainAt.get(`${hex.q},${hex.r}`) === "ridge" ? 1 : 0;
    const mist = view.weather === "mist" ? 1 : 0;
    const night = scenario.timeOfDay === "nightFires" ? 1 : 0;
    return Math.max(1, 2 + ridge - mist - night);
  };
  return scenario.board.hexes
    .map((h) => h.coord)
    .filter((c) => own.some((s) => hexDistance(s.hex!, c) <= sightAt(s.hex!)));
}
