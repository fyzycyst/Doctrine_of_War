import { doctrines } from "./doctrines";
import type { BoardHex, BoardLayout, TerrainType } from "./board";
import type { Scenario } from "./types";

function terrainFor(q: number, r: number): TerrainType {
  if (q === 7 && (r === 2 || r === 4)) {
    return "wall";
  }

  if (q === 2 && r <= 2) {
    return "ridge";
  }

  if ((q === 3 || q === 4) && r >= 4) {
    return "ford";
  }

  if ((q === 5 && r === 0) || (q === 6 && r >= 5)) {
    return "ruin";
  }

  if (r === 2 || r === 4) {
    return "road";
  }

  return "field";
}

const readabilityBoard: BoardLayout = {
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
        deploymentFaction:
          q <= 2 ? "ashen_host" : q >= 4 && q <= 6 && !objectiveId ? "free_banners" : undefined,
      };
    }),
  ).flat(),
};

export const readabilityScenario: Scenario = {
  id: "readability_gate_stress",
  title: "Readability Gate Stress",
  playerFaction: "free_banners",
  initiativeSide: "ashen_host",
  maxPhases: 3,
  briefing:
    "A wider breach line tests whether the current board, token, and playback presentation stay readable under more squads and simultaneous pressure.",
  lanes: [
    {
      id: "north_ridge",
      name: "North Ridge",
      x: 8,
      y: 10,
      width: 84,
      height: 16,
      description: "High ground that draws skirmisher pressure.",
    },
    {
      id: "crown_road",
      name: "Crown Road",
      x: 8,
      y: 30,
      width: 84,
      height: 18,
      description: "The upper road toward the Crown Gate.",
    },
    {
      id: "river_road",
      name: "River Road",
      x: 8,
      y: 52,
      width: 84,
      height: 18,
      description: "The lower approach toward the River Lock.",
    },
    {
      id: "south_ford",
      name: "South Ford",
      x: 8,
      y: 74,
      width: 84,
      height: 16,
      description: "A wet crossing that makes withdrawal and support placement harder to read.",
    },
  ],
  board: readabilityBoard,
  objectives: [
    {
      id: "crown_gate",
      name: "Crown Gate",
      description: "Hold the upper gate while pressure spreads across the wider line.",
      integrity: 100,
    },
    {
      id: "river_lock",
      name: "River Lock",
      description: "Keep the lower lock from drawing defenders away from the gate.",
      integrity: 100,
    },
  ],
  doctrines,
  squads: [
    {
      id: "crown_shields",
      name: "Crown Shields",
      faction: "free_banners",
      role: "frontline",
      laneId: "crown_road",
      hex: { q: 6, r: 2 },
      strength: 84,
      cohesion: 76,
      resolve: 2,
      assignedDoctrineId: "shield_the_line",
    },
    {
      id: "river_shields",
      name: "River Shields",
      faction: "free_banners",
      role: "frontline",
      laneId: "river_road",
      hex: { q: 6, r: 4 },
      strength: 80,
      cohesion: 72,
      resolve: 1,
      assignedDoctrineId: "hold_for_dawn",
    },
    {
      id: "ridge_archers",
      name: "Ridge Archers",
      faction: "free_banners",
      role: "skirmish",
      laneId: "north_ridge",
      hex: { q: 5, r: 1 },
      strength: 66,
      cohesion: 68,
      resolve: 1,
      assignedDoctrineId: "clean_counterstroke",
    },
    {
      id: "lock_archers",
      name: "Lock Archers",
      faction: "free_banners",
      role: "skirmish",
      laneId: "river_road",
      hex: { q: 5, r: 5 },
      strength: 62,
      cohesion: 70,
      resolve: 0,
      assignedDoctrineId: "clean_counterstroke",
    },
    {
      id: "upper_standard",
      name: "Upper Standard",
      faction: "free_banners",
      role: "support",
      laneId: "crown_road",
      hex: { q: 5, r: 2 },
      strength: 50,
      cohesion: 82,
      resolve: 0,
      assignedDoctrineId: "rescue_standard",
    },
    {
      id: "lower_standard",
      name: "Lower Standard",
      faction: "free_banners",
      role: "support",
      laneId: "river_road",
      hex: { q: 5, r: 4 },
      strength: 48,
      cohesion: 80,
      resolve: 0,
      assignedDoctrineId: "rescue_standard",
    },
    {
      id: "ford_riders",
      name: "Ford Riders",
      faction: "free_banners",
      role: "cavalry",
      laneId: "south_ford",
      hex: { q: 4, r: 5 },
      strength: 70,
      cohesion: 64,
      resolve: -1,
      assignedDoctrineId: "fighting_withdrawal",
    },
    {
      id: "ash_engine_one",
      name: "Ash Engine One",
      faction: "ashen_host",
      role: "siege",
      laneId: "crown_road",
      hex: { q: 1, r: 2 },
      strength: 82,
      cohesion: 68,
      resolve: 2,
      assignedDoctrineId: "break_the_gate",
    },
    {
      id: "ash_engine_two",
      name: "Ash Engine Two",
      faction: "ashen_host",
      role: "siege",
      laneId: "river_road",
      hex: { q: 1, r: 4 },
      strength: 78,
      cohesion: 66,
      resolve: 1,
      assignedDoctrineId: "break_the_gate",
    },
    {
      id: "cinder_pike",
      name: "Cinder Pike",
      faction: "ashen_host",
      role: "frontline",
      laneId: "crown_road",
      hex: { q: 2, r: 2 },
      strength: 88,
      cohesion: 72,
      resolve: 1,
      assignedDoctrineId: "iron_tide",
    },
    {
      id: "ember_pike",
      name: "Ember Pike",
      faction: "ashen_host",
      role: "frontline",
      laneId: "river_road",
      hex: { q: 2, r: 4 },
      strength: 84,
      cohesion: 70,
      resolve: 1,
      assignedDoctrineId: "iron_tide",
    },
    {
      id: "ridge_runners",
      name: "Ridge Runners",
      faction: "ashen_host",
      role: "skirmish",
      laneId: "north_ridge",
      hex: { q: 2, r: 0 },
      strength: 62,
      cohesion: 62,
      resolve: 0,
      assignedDoctrineId: "iron_tide",
    },
    {
      id: "ford_reavers_wide",
      name: "Ford Reavers",
      faction: "ashen_host",
      role: "frontline",
      laneId: "south_ford",
      hex: { q: 2, r: 5 },
      strength: 72,
      cohesion: 64,
      resolve: 0,
      assignedDoctrineId: "iron_tide",
    },
    {
      id: "ash_reserve",
      name: "Ash Reserve",
      faction: "ashen_host",
      role: "frontline",
      laneId: "crown_road",
      hex: { q: 0, r: 3 },
      strength: 76,
      cohesion: 70,
      resolve: 0,
      assignedDoctrineId: "iron_tide",
    },
  ],
  scriptedOpponent: [
    {
      phase: 1,
      hostIntent: "The Host probes both roads and sends runners along the high ground.",
      threats: [
        {
          laneId: "crown_road",
          targetHex: { q: 5, r: 2 },
          attackerSquadId: "ash_engine_one",
          pressure: 28,
          note: "Ash Engine One tests the upper standard.",
        },
        {
          laneId: "river_road",
          targetHex: { q: 5, r: 4 },
          attackerSquadId: "ash_engine_two",
          pressure: 26,
          note: "Ash Engine Two hammers the lower road.",
        },
        {
          laneId: "north_ridge",
          targetHex: { q: 5, r: 1 },
          attackerSquadId: "ridge_runners",
          pressure: 18,
          note: "Ridge Runners try to scatter the archers.",
        },
      ],
    },
    {
      phase: 2,
      hostIntent: "Infantry follows the engines and widens the pressure across both locks.",
      threats: [
        {
          laneId: "crown_road",
          targetHex: { q: 6, r: 2 },
          attackerSquadId: "cinder_pike",
          pressure: 30,
          note: "Cinder Pike crowds the Crown Gate approach.",
        },
        {
          laneId: "river_road",
          targetHex: { q: 6, r: 4 },
          attackerSquadId: "ember_pike",
          pressure: 28,
          note: "Ember Pike presses the River Lock approach.",
        },
      ],
    },
    {
      phase: 3,
      hostIntent: "The final push splits the defenders between the gate, lock, and ford.",
      threats: [
        {
          laneId: "crown_road",
          targetHex: { q: 7, r: 2 },
          attackerSquadId: "ash_engine_one",
          pressure: 34,
          note: "Ash Engine One drives at the Crown Gate.",
        },
        {
          laneId: "south_ford",
          targetHex: { q: 4, r: 5 },
          attackerSquadId: "ford_reavers_wide",
          pressure: 24,
          note: "Ford Reavers pull riders toward the crossing.",
        },
      ],
    },
  ],
};
