import type { HexCoord } from "../../game/board";
import type { FactionId } from "../../game/types";
import { hexKey } from "../../game/board";
import { hexToWorld } from "../hexWorld";
import { figureCount, formationSlots, type FigureSlot } from "../squadLayout";
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
  figures: PlacedFigure[];
}

function seedFor(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Lays out every squad's figures in world space on top of its hex. */
export function placeSquads(squads: DioramaSquad[], island: IslandBuild, maxFigures: number): PlacedSquad[] {
  return squads.map((squad) => {
    const [x, z] = hexToWorld(squad.hex, island.center);
    const y = island.surface.get(hexKey(squad.hex)) ?? 0.3;
    const slots: FigureSlot[] = formationSlots(figureCount(squad.strength, maxFigures), seedFor(squad.id));
    const cos = Math.cos(squad.facing);
    const sin = Math.sin(squad.facing);
    const figures = slots.map((slot) => ({
      squadId: squad.id,
      faction: squad.faction,
      // Local +x is "forward"; rotate by facing (three's yaw maps +x to (cos, -sin)).
      x: x + slot.forward * cos + slot.side * sin,
      y,
      z: z - slot.forward * sin + slot.side * cos,
      yaw: squad.facing + slot.yaw,
      phase: slot.phase,
    }));
    return { squad, x, y, z, figures };
  });
}
