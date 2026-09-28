// Friction & fortune seams (tech plan §4a). T03 ships these as no-ops; T04 fills
// them in. Every seam receives the engine options and the rng. With
// `fortune: "off"` a seam MUST return its neutral outcome and must not consume
// the rng, so the engine stays fully deterministic regardless of seed.
import type { Rng } from "./rng";
import type { DoctrineRule, EngineEvent, EngineSquad, EngineState, EngineScenario } from "./types";

export type FortuneMode = "on" | "off";

export interface EngineOptions {
  /** Default "off". "on" enables the chance systems once T04 implements them. */
  fortune: FortuneMode;
}

export interface FortuneContext {
  state: EngineState;
  scenario: EngineScenario;
  options: EngineOptions;
  rng: Rng;
  phase: number;
  beat: number;
}

/**
 * Phase-start weather seam: called once before beat 1.
 * T04: roll a weather shift and return `weatherShift` events.
 */
export function phaseStartWeather(ctx: FortuneContext): EngineEvent[] {
  if (ctx.options.fortune === "off") {
    return [];
  }
  return [];
}

/**
 * Stress-check seam: called after a squad picks its rule and before the action runs.
 * Return the rule to execute (possibly a substitute, e.g. a heroic hold), or null
 * for "wavered: the rule does not fire this beat".
 * T04: courage & cowardice checks for squads that are engaged or below 50 cohesion.
 */
export function stressCheck(
  ctx: FortuneContext,
  _squad: EngineSquad,
  rule: DoctrineRule,
): { rule: DoctrineRule | null; events: EngineEvent[] } {
  if (ctx.options.fortune === "off") {
    return { rule, events: [] };
  }
  return { rule, events: [] };
}

/**
 * First-contact seam: called the first time two opposing squads engage.
 * T04: renown & dread shocks and fog-of-war `sighted` events hang off this point.
 */
export function firstContact(
  ctx: FortuneContext,
  _a: EngineSquad,
  _b: EngineSquad,
): EngineEvent[] {
  if (ctx.options.fortune === "off") {
    return [];
  }
  return [];
}
