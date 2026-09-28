// The 14-squad readability / performance fixture, ported from the legacy lane-era
// scenario to the engine's scenario format. Lab-only (performance checks and
// readability captures); not part of the campaign.
import type { BoardHex, BoardLayout, TerrainType } from "../../game/board";
import type { EngineScenario, SquadSetup } from "../../game/engine/types";

function terrainFor(q: number, r: number): TerrainType {
  if (q === 7 && (r === 2 || r === 4)) return "wall";
  if (q === 2 && r <= 2) return "ridge";
  if ((q === 3 || q === 4) && r >= 4) return "ford";
  if ((q === 5 && r === 0) || (q === 6 && r >= 5)) return "ruin";
  if (r === 2 || r === 4) return "road";
  return "field";
}

const board: BoardLayout = {
  width: 8,
  height: 7,
  hexes: Array.from({ length: 8 }, (_, q) =>
    Array.from({ length: 7 }, (_, r): BoardHex => {
      const objectiveId = q === 7 && r === 2 ? "crown_gate" : q === 7 && r === 4 ? "river_lock" : undefined;
      return {
        coord: { q, r },
        terrain: terrainFor(q, r),
        label: objectiveId === "crown_gate" ? "Crown Gate" : objectiveId === "river_lock" ? "River Lock" : undefined,
        objectiveId,
        deploymentFaction: q <= 2 ? "ashen_host" : q >= 4 && q <= 6 && !objectiveId ? "free_banners" : undefined,
      };
    }),
  ).flat(),
};

type Row = [id: string, name: string, faction: SquadSetup["faction"], role: SquadSetup["role"], q: number, r: number, strength: number, cohesion: number, resolve: number];

const rows: Row[] = [
  ["crown_shields", "Crown Shields", "free_banners", "frontline", 6, 2, 84, 76, 2],
  ["river_shields", "River Shields", "free_banners", "frontline", 6, 4, 80, 72, 1],
  ["ridge_archers", "Ridge Archers", "free_banners", "skirmish", 5, 1, 66, 68, 1],
  ["lock_archers", "Lock Archers", "free_banners", "skirmish", 5, 5, 62, 70, 0],
  ["upper_standard", "Upper Standard", "free_banners", "support", 5, 2, 50, 82, 0],
  ["lower_standard", "Lower Standard", "free_banners", "support", 5, 4, 48, 80, 0],
  ["ford_riders", "Ford Riders", "free_banners", "cavalry", 4, 5, 70, 64, -1],
  ["ash_engine_one", "Ash Engine One", "ashen_host", "siege", 1, 2, 82, 68, 2],
  ["ash_engine_two", "Ash Engine Two", "ashen_host", "siege", 1, 4, 78, 66, 1],
  ["cinder_pike", "Cinder Pike", "ashen_host", "frontline", 2, 2, 88, 72, 1],
  ["ember_pike", "Ember Pike", "ashen_host", "frontline", 2, 4, 84, 70, 1],
  ["ridge_runners", "Ridge Runners", "ashen_host", "skirmish", 2, 0, 62, 62, 0],
  ["ford_reavers_wide", "Ford Reavers", "ashen_host", "frontline", 2, 5, 72, 64, 0],
  ["ash_reserve", "Ash Reserve", "ashen_host", "frontline", 0, 3, 76, 70, 0],
];

const doctrineFor: Record<SquadSetup["role"], string> = {
  frontline: "shield_the_line",
  skirmish: "clean_counterstroke",
  support: "rescue_standard",
  cavalry: "clean_counterstroke",
  siege: "break_the_gate",
};

export const stressScenario: EngineScenario = {
  id: "readability_stress",
  title: "Readability Stress (lab)",
  briefing: "A wide breach line with fourteen companies, for readability and performance checks.",
  playerFaction: "free_banners",
  initiativeSide: "ashen_host",
  maxPhases: 3,
  board,
  squads: rows.map(([id, name, faction, role, q, r, strength, cohesion, resolve]) => ({
    id,
    name,
    faction,
    role,
    hex: { q, r },
    strength,
    cohesion,
    resolve,
    doctrineId: faction === "ashen_host" && role !== "siege" ? "iron_tide" : doctrineFor[role],
  })),
  objectives: [
    { id: "crown_gate", name: "Crown Gate", description: "The upper gate.", hex: { q: 7, r: 2 }, integrity: 100, defender: "free_banners" },
    { id: "river_lock", name: "River Lock", description: "The lower gate.", hex: { q: 7, r: 4 }, integrity: 100, defender: "free_banners" },
  ],
  playerDoctrineIds: ["shield_the_line", "clean_counterstroke", "rescue_standard"],
  hostSchedule: [],
  winCondition: { kind: "holdObjective", objectiveId: "crown_gate" },
};
