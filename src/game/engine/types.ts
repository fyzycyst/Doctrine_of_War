// Doctrine engine v2 schema. Everything in this file is plain JSON-serializable data:
// no functions, classes, Dates or Maps, so doctrines and scenarios can be saved,
// diffed and edited by a future in-game doctrine editor.
import type { BoardLayout, HexCoord } from "../board";
import type { FactionId, SquadRole } from "../types";

export type { FactionId, SquadRole };

export type Stat = "cohesion" | "strength";

/** "off" = no chance, no fog: the battle is fully deterministic and omniscient. */
export type FortuneMode = "on" | "off";

/** Resolve band as a record key: -3 Broken … 0 Green … +3 Veteran. */
export type Resolve = "-3" | "-2" | "-1" | "0" | "1" | "2" | "3";

export type Weather = "clear" | "rain" | "mist" | "ashWind";

/**
 * "nightFires": darkness cuts sight by 1, but burning crossings light the water, so a
 * squad on a ford or next to the river can be seen from 1 hex further. Also a
 * lighting cue for the renderer.
 */
export type TimeOfDay = "day" | "nightFires";

export interface Forecast {
  /** Weather for phase 1 (and for the whole battle when fortune is off). */
  start: Weather;
  /** Chance (0..1) at the start of each later phase that the weather shifts. */
  shiftChance: number;
  /** What it can shift to (the current weather is skipped). */
  shifts: Weather[];
}

export interface Renown {
  /** e.g. "The Gatebreakers". */
  title: string;
}

// ---------------------------------------------------------------------------
// Doctrine rules
// ---------------------------------------------------------------------------

export type Condition =
  | { kind: "always" }
  | { kind: "selfCohesionBelow"; value: number }
  | { kind: "selfStrengthBelow"; value: number }
  | { kind: "enemyAdjacent" }
  | { kind: "enemyWithin"; range: number }
  /** An enemy within `range` whose stat is below `value`. */
  | { kind: "enemyBelow"; stat: Stat; value: number; range: number }
  | { kind: "allyAdjacentBelow"; stat: Stat; value: number }
  /** Any ally on the board (not self) whose stat is below `value`. */
  | { kind: "allyBelow"; stat: Stat; value: number }
  /** An enemy within `range` (default 3) with no active allies adjacent to it. */
  | { kind: "enemyOverextended"; range?: number }
  /** An enemy is within 2 hexes of an objective this squad's faction defends. */
  | { kind: "objectiveThreatened"; objectiveId?: string }
  /** This squad stands adjacent to a standing objective its faction assaults. */
  | { kind: "atObjective"; objectiveId?: string };

/** Targets an offensive action (attack, counterCharge) may strike. */
export type EnemySelector =
  | { kind: "nearestEnemy" }
  | { kind: "weakestEnemy"; stat: Stat; range?: number }
  | { kind: "overextendedEnemy"; range?: number }
  | { kind: "objective"; side: "enemy"; objectiveId?: string };

/** Any target a squad may move toward. */
export type TargetSelector =
  | EnemySelector
  | { kind: "weakestAlly"; stat: Stat }
  /** "own" = an objective this squad's faction defends; "enemy" = one it assaults. */
  | { kind: "objective"; side: "own" | "enemy"; objectiveId?: string }
  | { kind: "exitEdge" };

export type Action =
  /** Stay put and brace: defense bonus until this squad's next activation. */
  | { kind: "hold" }
  /** Move up to the squad's speed toward the target. Already there = hold. */
  | { kind: "advance"; toward: TargetSelector }
  /** Strike the target if adjacent (enemy squad or objective hex); otherwise advance toward it. */
  | { kind: "attack"; target: EnemySelector }
  /** Move away from the nearest enemies. Ignores zones of control. */
  | { kind: "fallBack"; hexes: 1 | 2 }
  /** Restore cohesion to the weakest adjacent ally. */
  | { kind: "rally" }
  /** Move up to speed + 1 toward the target and strike on arrival, with the counter passive. */
  | { kind: "counterCharge"; target: EnemySelector };

export interface DoctrineRule {
  id: string;
  /** Short player-facing text, e.g. "If cohesion < 40 → fall back 1 hex". */
  label: string;
  when: Condition;
  then: Action;
}

export interface DoctrinePassives {
  /** Added to defense in every engagement where this squad is struck. */
  defense: number;
  /** Subtracted from cohesion losses; added to rally strength. */
  cohesion: number;
  /** Added to charge attacks and to ripostes. */
  counter: number;
}

export interface Doctrine {
  id: string;
  faction: FactionId;
  name: string;
  flavor: string;
  /** Evaluated top to bottom each activation; the first matching rule fires. */
  rules: DoctrineRule[];
  passives: DoctrinePassives;
}

export type DoctrineLibrary = Record<string, Doctrine>;

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export interface SquadSetup {
  id: string;
  name: string;
  faction: FactionId;
  role: SquadRole;
  hex: HexCoord;
  strength: number;
  cohesion: number;
  resolve: number;
  doctrineId: string;
  renown?: Renown;
}

export interface ObjectiveSetup {
  id: string;
  name: string;
  description: string;
  hex: HexCoord;
  integrity: number;
  /** The faction that loses if this objective falls. */
  defender: FactionId;
}

/** Win conditions are always stated from the player faction's point of view. */
export type WinCondition =
  /** Victory if the objective's integrity is > 0 at the end of maxPhases; defeat the moment it hits 0. */
  | { kind: "holdObjective"; objectiveId: string }
  /** Victory once `count` player squads leave the board via `edgeHexes`; defeat at the end of maxPhases. */
  | { kind: "escapeEdge"; edgeHexes: HexCoord[]; count: number }
  /** Victory once every listed squad is routed or destroyed; defeat at the end of maxPhases. */
  | { kind: "destroySquads"; squadIds: string[] };

/** Extra ways the player can lose, on top of the win condition's own defeat rules. */
export type DefeatCondition =
  /** The opposing side gets `count` squads off the board via `edgeHexes`. */
  | { kind: "enemyEscape"; edgeHexes: HexCoord[]; count: number }
  /** `count` player squads are routed or destroyed ("the line breaks"). */
  | { kind: "squadsLost"; count: number };

export interface HostPhaseOrders {
  phase: number;
  /** One line describing the Host's intent; used as the report title. */
  intent: string;
  /** squadId -> doctrineId. Squads not listed keep their previous doctrine. */
  orders: Record<string, string>;
}

export interface EngineScenario {
  id: string;
  title: string;
  briefing: string;
  playerFaction: FactionId;
  initiativeSide: FactionId;
  maxPhases: number;
  board: BoardLayout;
  /** Order matters: it is the activation order within a side. */
  squads: SquadSetup[];
  objectives: ObjectiveSetup[];
  /** Doctrine ids the player may assign. */
  playerDoctrineIds: string[];
  /** The opponent (non-player) side's doctrine assignments per phase. */
  hostSchedule: HostPhaseOrders[];
  winCondition: WinCondition;
  defeatConditions?: DefeatCondition[];
  /**
   * What running out of phases means when the win condition is not "survive"
   * (holdObjective always wins on time). Default "defeat".
   */
  timeoutOutcome?: "defeat" | "stalemate";
  /** Defaults to "day". */
  timeOfDay?: TimeOfDay;
  /** A fortune-on seed that plays the intended plan to a clean win (first playthrough, video capture). */
  curatedSeed?: number;
  /** Defaults to clear skies that never shift. */
  forecast?: Forecast;
  /** Reference plans for the balance harness and tutorial hints. */
  referencePlans?: { intended: Orders; bad: Orders };
}

// ---------------------------------------------------------------------------
// Battle state
// ---------------------------------------------------------------------------

export type SquadStatus = "active" | "routed" | "destroyed" | "escaped";

export interface EngineSquad {
  id: string;
  name: string;
  faction: FactionId;
  role: SquadRole;
  /** null once the squad has left the board (routed, destroyed or escaped). */
  hex: HexCoord | null;
  strength: number;
  cohesion: number;
  resolve: number;
  doctrineId: string;
  status: SquadStatus;
  /** Set by a hold; cleared at the squad's next activation. */
  braced: boolean;
  /** Set by a courage surge; cleared at the squad's next activation. */
  surging: boolean;
  renown?: Renown;
}

/** What one faction last saw of one enemy squad (fog of war). */
export interface Intel {
  /** In sight right now. */
  visible: boolean;
  /** Snapshot taken the last time the squad was in sight. */
  hex: HexCoord | null;
  strength: number;
  cohesion: number;
  status: SquadStatus;
  phase: number;
  beat: number;
}

export interface EngineObjective {
  id: string;
  name: string;
  hex: HexCoord;
  integrity: number;
  defender: FactionId;
}

/** "stalemate": time ran out with neither side's goal met (only when the scenario allows it). */
export type BattleOutcome = "victory" | "defeat" | "stalemate";

export type EngineStatus = "command" | BattleOutcome;

export interface EngineState {
  scenarioId: string;
  /** The phase that the next resolvePhase call will resolve. */
  phase: number;
  maxPhases: number;
  status: EngineStatus;
  squads: EngineSquad[];
  objectives: EngineObjective[];
  /** Sorted "a|b" squad-id pairs that have engaged at least once (first-contact seam bookkeeping). */
  contacts: string[];
  /** Fixed at battle start. */
  fortune: FortuneMode;
  /** The battle's seed (shown in reports) and the current mulberry32 state. */
  seed: number;
  rngState: number;
  weather: Weather;
  /** faction -> enemy squadId -> last sighting. Empty when fortune is off. */
  intel: Partial<Record<FactionId, Record<string, Intel>>>;
  /** "viewerId>renownedId" pairs whose dread check has already happened. */
  dreaded: string[];
}

/** squadId -> doctrineId for the player's squads. */
export type Orders = Record<string, string>;

// ---------------------------------------------------------------------------
// Events and report
// ---------------------------------------------------------------------------

interface EventBase {
  phase: number;
  /** 1..3; 0 for phase-level events. */
  beat: number;
  /**
   * The factions that witnessed this event, fixed when it happened (fog of war).
   * Playback and reports for a faction must use eventsFor(events, faction).
   */
  visibleTo: FactionId[];
  /**
   * What each witnessing faction did NOT see of this event (raw stream only).
   * eventsFor() applies these and strips the field, so projections never carry it.
   */
  redactions?: Partial<Record<FactionId, Redaction>>;
}

/** Parts of an event a witnessing faction did not see. */
export interface Redaction {
  /** For a move: which path hexes (same order as `path`) the faction could see. */
  pathSeen?: boolean[];
}

export type EngineEvent =
  | (EventBase & {
      kind: "ruleFired";
      squadId: string;
      doctrineId: string;
      ruleId: string;
      label: string;
    })
  | (EventBase & {
      kind: "move";
      squadId: string;
      /** Includes the starting hex. In a projection: only the hexes that faction saw. */
      path: HexCoord[];
      /** Where the move started; null in a projection that did not see it (emerging from the fog). */
      from: HexCoord | null;
      /** Where it ended; null in a projection that did not see it (vanishing into the fog). */
      to: HexCoord | null;
      reason: "advance" | "fallBack" | "charge";
    })
  | (EventBase & { kind: "blocked"; squadId: string; reason: string })
  | (EventBase & {
      kind: "engagement";
      attackerId: string;
      defenderId: string;
      attackerHex: HexCoord;
      defenderHex: HexCoord;
      charge: boolean;
      /** A charge into a supported (not overextended) enemy: no charge bonus, and its neighbours join the riposte. */
      reckless: boolean;
      strengthChanges: Record<string, number>;
      cohesionChanges: Record<string, number>;
    })
  | (EventBase & { kind: "rally"; sourceId: string; targetId: string; restored: number })
  | (EventBase & {
      kind: "rout";
      squadId: string;
      hex: HexCoord;
      cause: "cohesion" | "strength";
    })
  | (EventBase & { kind: "exit"; squadId: string; hex: HexCoord })
  | (EventBase & {
      kind: "objectiveDamage";
      objectiveId: string;
      attackerId: string;
      hex: HexCoord;
      oldIntegrity: number;
      newIntegrity: number;
    })
  | (EventBase & { kind: "outcome"; status: BattleOutcome; reason: string })
  | (EventBase & { kind: "fortune"; squadId: string; outcome: "surge" | "waver"; ruleId: string })
  | (EventBase & { kind: "dread"; squadId: string; sourceId: string; title: string; shock: number })
  | (EventBase & { kind: "weatherShift"; from: Weather; to: Weather })
  | (EventBase & {
      kind: "sighted";
      /** The side that now sees the squad. */
      faction: FactionId;
      squadId: string;
      byId: string;
      hex: HexCoord;
    });

export interface PhaseReport {
  phase: number;
  title: string;
  seed: number;
  weather: Weather;
  lines: string[];
  status: EngineStatus;
}

export interface PhaseResult {
  state: EngineState;
  events: EngineEvent[];
  report: PhaseReport;
}
