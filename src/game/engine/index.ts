export * from "./types";
export { createRng, type Rng } from "./rng";
export { doctrines, doctrineLibrary } from "./doctrines";
export {
  resolvePhase,
  createInitialState,
  BEATS_PER_PHASE,
  type BattleOptions,
  type ResolveOptions,
} from "./resolvePhase";
export { visibleState, type VisibleSquad, type VisibleState } from "./fog";
export { evaluateOutcome } from "./outcome";
export { narrateEvent } from "./report";
export { firstBreach } from "./scenarios/firstBreach";
