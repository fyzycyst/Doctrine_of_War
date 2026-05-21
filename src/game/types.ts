import type { BoardLayout, HexCoord } from "./board";

export type FactionId = "ashen_host" | "free_banners";

export type SquadRole = "frontline" | "skirmish" | "support" | "siege" | "cavalry";
export type Stance = "defensive" | "balanced" | "aggressive" | "evasive";
export type TargetPriority = "nearest" | "objective" | "siege" | "wounded_allies" | "overextended";
export type FormationBehavior = "hold" | "withdraw" | "screen" | "counterstroke" | "support";
export type RetreatThreshold = "never" | "severe" | "moderate" | "early";
export type PursuitRule = "none" | "short" | "full";

export interface Doctrine {
  id: string;
  faction: FactionId;
  name: string;
  summary: string;
  stance: Stance;
  targetPriority: TargetPriority;
  formation: FormationBehavior;
  retreatThreshold: RetreatThreshold;
  pursuit: PursuitRule;
  cohesionBias: number;
  defenseBias: number;
  counterBias: number;
}

export interface Lane {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  description: string;
}

export interface Squad {
  id: string;
  name: string;
  faction: FactionId;
  role: SquadRole;
  laneId: string;
  hex?: HexCoord;
  strength: number;
  cohesion: number;
  resolve: number;
  assignedDoctrineId: string;
}

export interface Objective {
  id: string;
  name: string;
  description: string;
  integrity: number;
}

export interface ScriptedThreat {
  laneId: string;
  targetHex?: HexCoord;
  attackerSquadId: string;
  pressure: number;
  note: string;
}

export interface ScriptedPhase {
  phase: number;
  hostIntent: string;
  threats: ScriptedThreat[];
}

export interface Scenario {
  id: string;
  title: string;
  briefing: string;
  playerFaction: FactionId;
  initiativeSide: FactionId;
  maxPhases: number;
  lanes: Lane[];
  board?: BoardLayout;
  squads: Squad[];
  doctrines: Doctrine[];
  objectives: Objective[];
  scriptedOpponent: ScriptedPhase[];
}

export interface BattleEvent {
  phase: number;
  faction: FactionId;
  kind: "initiative" | "clash" | "support" | "objective" | "terminal";
  message: string;
}

export type PhaseEvent =
  | {
      phase: number;
      kind: "engagement";
      attackerSquadId: string;
      defenderSquadIds: string[];
      targetHex: HexCoord;
      strengthChanges: Record<string, number>;
      cohesionChanges: Record<string, number>;
    }
  | {
      phase: number;
      kind: "support";
      sourceSquadId: string;
      targetSquadId: string;
      affectedHexes: HexCoord[];
      restored: number;
    }
  | {
      phase: number;
      kind: "objectiveDamage";
      objectiveId: string;
      hex: HexCoord;
      oldIntegrity: number;
      newIntegrity: number;
    };

export interface BattleReport {
  phase: number;
  title: string;
  casualties: string[];
  cohesionChanges: string[];
  objectiveChanges: string[];
  notes: string[];
  phaseEvents: PhaseEvent[];
}

export type BattleStatus = "command" | "victory" | "defeat";

export interface BattleState {
  scenarioId: string;
  currentPhase: number;
  maxPhases: number;
  status: BattleStatus;
  squads: Squad[];
  objectives: Objective[];
  reports: BattleReport[];
  events: BattleEvent[];
}

export type DoctrineAssignments = Record<string, string>;
