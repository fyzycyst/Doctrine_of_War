import type { HexCoord } from "../../game/board";
import type { FactionId } from "../../game/engine/types";
import { hexKey } from "../../game/board";
import { hexToWorld } from "../hexWorld";
import { figureCount, formationOrder, type FigureSlot } from "../squadLayout";
import type { IslandBuild } from "../terrain/buildIsland";

/** What the renderer needs to draw a squad; derived from engine Squad state. */
export interface DioramaSquad {
  id: string;
  faction: FactionId;
  hex: HexCoord;
  strength: number;
  cohesion: number;
  /** Yaw the squad faces (radians, 0 = +x/east). */
  facing: number;
  /** Renowned squads (Resolve +3) carry a gold crest above their banner. */
  renowned?: boolean;
  /**
   * Fog of war: an enemy shown where it was last seen. Drawn as a dark,
   * translucent silhouette with no banner colour and a dashed ring.
   */
  lastKnown?: boolean;
  /**
   * "column" = the noncombatant refugee Column (Saltmarsh): walkers with
   * lanterns and covered carts under a small pale banner. Default "combat".
   */
  kind?: "combat" | "column";
}

export type FigureApproach = "toy" | "kaykit";

export interface PlacedFigure {
  squadId: string;
  faction: FactionId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  phase: number;
}

export interface PlacedSquad {
  squad: DioramaSquad;
  x: number;
  y: number;
  z: number;
  /** All nine formation slots in survival order (see `formationOrder`). */
  slots: FigureSlot[];
  /** How many of `slots` are alive at the current strength. */
  alive: number;
  /** Static world positions of the alive figures (used by approach b). */
  figures: PlacedFigure[];
}

export function seedFor(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Local slot offset rotated into world space by a facing yaw. */
export function slotToWorld(slot: FigureSlot, facing: number, spread = 1): [number, number] {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  // Local +x is "forward"; three's yaw maps +x to (cos, -sin) and +z to (sin, cos).
  return [(slot.forward * cos + slot.side * sin) * spread, (-slot.forward * sin + slot.side * cos) * spread];
}

/** Lays out every squad's figures in world space on top of its hex. */
export function placeSquads(squads: DioramaSquad[], island: IslandBuild, maxFigures: number): PlacedSquad[] {
  return squads.map((squad) => {
    const [x, z] = hexToWorld(squad.hex, island.center);
    const y = island.surface.get(hexKey(squad.hex)) ?? 0.3;
    const slots = formationOrder(seedFor(squad.id));
    const alive = figureCount(squad.strength, maxFigures);
    const figures = slots.slice(0, alive).map((slot) => {
      const [ox, oz] = slotToWorld(slot, squad.facing);
      return {
        squadId: squad.id,
        faction: squad.faction,
        x: x + ox,
        y,
        z: z + oz,
        yaw: squad.facing + slot.yaw,
        phase: slot.phase,
      };
    });
    return { squad, x, y, z, slots, alive, figures };
  });
}
