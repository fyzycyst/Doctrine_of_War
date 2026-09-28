import type { SquadSetup, TimeOfDay as EngineTimeOfDay } from "../game/engine/types";
import type { DioramaSquad } from "./figures/types";
import type { TimeOfDay } from "./skins/types";

/**
 * Pure mapping from the engine's scenario/squad shapes to what the Diorama
 * draws. Type-only engine imports: the renderer never runs engine logic.
 */

/** The engine's semantic time of day → the skin's lighting preset key. */
export function lightingFor(timeOfDay: EngineTimeOfDay | undefined): TimeOfDay {
  return timeOfDay === undefined || timeOfDay === "day" ? "dusk" : timeOfDay;
}

/** Squads face the enemy: the Banners west, the Host east. */
export function facingFor(faction: SquadSetup["faction"]): number {
  return faction === "free_banners" ? Math.PI : 0;
}

export function dioramaSquads(squads: Array<Pick<SquadSetup, "id" | "faction" | "hex" | "strength" | "cohesion" | "renown">>): DioramaSquad[] {
  return squads.map((s) => ({
    id: s.id,
    faction: s.faction,
    hex: s.hex,
    strength: s.strength,
    cohesion: s.cohesion,
    facing: facingFor(s.faction),
    renowned: !!s.renown,
  }));
}
