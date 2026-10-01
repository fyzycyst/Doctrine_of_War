export * from "./types";
export { createRng, type Rng } from "./rng";
export { doctrines, doctrineLibrary } from "./doctrines";
export {
  resolvePhase,
  createInitialState,
  isOrderAllowed,
  BEATS_PER_PHASE,
  type BattleOptions,
  type ResolveOptions,
} from "./resolvePhase";
export { blocksSight, eventsFor, sightRangeAt, timeOfDayAt, visibleHexes, visibleState, type VisibleSquad, type VisibleState } from "./fog";
export { endsMove } from "./movement";
export { bracesOn } from "./actions";
export {
  applyDeployment,
  checkPlacement,
  deploymentHexes,
  validateDeployment,
  type PlacementCheck,
  type Placements,
} from "./deployment";
export { evaluateOutcome, winStage } from "./outcome";
export {
  applyMuster,
  heuristicMuster,
  musterOptions,
  validateMuster,
  MUSTER_HALTED,
  type MusterMove,
  type MusterOption,
  type MusterPolicy,
  type MusterProblems,
} from "./muster";
export { narrateEvent, type NameSource } from "./report";
export { firstBreach } from "./scenarios/firstBreach";
export { emberFord } from "./scenarios/emberFord";
export { saltmarshColumn } from "./scenarios/saltmarshColumn";
export { holdForDawn } from "./scenarios/holdForDawn";
export { scenarios } from "./scenarios";
export * from "./editor";
