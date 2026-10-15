// The working context resolvePhase threads through rules, actions and fortune.
import type { Rng } from "./rng";
import type { DoctrineLibrary, EngineEvent, EngineScenario, EngineSquad, EngineState } from "./types";

/** An event without its phase/beat/visibility stamp; resolvePhase adds those. */
export type EventBody<E = EngineEvent> = E extends EngineEvent ? Omit<E, "phase" | "beat" | "visibleTo" | "redactions" | "introduces"> : never;

export interface RuleContext {
  state: EngineState;
  scenario: EngineScenario;
}

export interface EngineContext extends RuleContext {
  doctrines: DoctrineLibrary;
  /** Only fortune systems may draw from this, and only when state.fortune is "on". */
  rng: Rng;
  emit: (event: EventBody) => void;
  phase: number;
  beat: number;
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function fortuneOn(ctx: RuleContext): boolean {
  return ctx.state.fortune === "on";
}

/** Removes a squad at 0 strength (destroyed) or 0 cohesion (routed) from the board. */
export function checkRout(ctx: EngineContext, squad: EngineSquad) {
  if (squad.status !== "active" || !squad.hex) {
    return;
  }
  const cause = squad.strength <= 0 ? "strength" : squad.cohesion <= 0 ? "cohesion" : null;
  if (!cause) {
    return;
  }
  ctx.emit({ kind: "rout", squadId: squad.id, hex: squad.hex, cause });
  squad.status = cause === "strength" ? "destroyed" : "routed";
  squad.hex = null;
  squad.braced = false;
  squad.surging = false;
}
