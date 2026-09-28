// Friction & fortune (tech plan §4a): courage & cowardice, weather, and the
// first-contact hook for renown & dread (fog and dread live in fog.ts).
// Rule: with state.fortune "off" every function here returns its neutral outcome
// and never draws from ctx.rng, so the battle is fully deterministic.
import { fortuneOn, type EngineContext } from "./context";
import { applyDread } from "./fog";
import type { DoctrineRule, EngineSquad, Resolve, Weather } from "./types";
import { adjacentEnemies, isActive } from "./world";

/** A squad is under stress when it is engaged (enemy adjacent) or its cohesion is below this. */
export const STRESS_COHESION = 50;

/** Chance to waver (rule fails to fire) when under stress, by Resolve -3..+3. */
export const WAVER_CHANCE: Record<Resolve, number> = {
  "-3": 0.3,
  "-2": 0.24,
  "-1": 0.18,
  "0": 0.13,
  "1": 0.09,
  "2": 0.06,
  "3": 0.03,
};

/** Chance to surge (heroic stand) when under stress, by Resolve -3..+3. */
export const SURGE_CHANCE: Record<Resolve, number> = {
  "-3": 0.02,
  "-2": 0.03,
  "-1": 0.04,
  "0": 0.06,
  "1": 0.08,
  "2": 0.1,
  "3": 0.13,
};

/** Cohesion regained on a surge. */
export const SURGE_COHESION = 5;

export function resolveBand(resolve: number): Resolve {
  return String(Math.max(-3, Math.min(3, Math.round(resolve)))) as Resolve;
}

export function isStressed(ctx: EngineContext, squad: EngineSquad): boolean {
  return isActive(squad) && (squad.cohesion < STRESS_COHESION || adjacentEnemies(ctx.state, squad).length > 0);
}

const heroicStand = (rule: DoctrineRule): DoctrineRule => ({
  id: rule.id,
  label: "Heroic stand! → hold and strike harder",
  when: { kind: "always" },
  then: { kind: "hold" },
});

/**
 * Courage & cowardice: called after a squad picks its rule, before the action runs.
 * Returns the rule to execute, or null when the squad wavers (the rule fails to fire).
 * On a surge the squad regains cohesion, hits and defends harder until its next
 * activation, and ignores a fall-back rule to stand its ground instead.
 */
export function stressCheck(ctx: EngineContext, squad: EngineSquad, rule: DoctrineRule): DoctrineRule | null {
  if (!fortuneOn(ctx) || !isStressed(ctx, squad)) {
    return rule;
  }
  const band = resolveBand(squad.resolve);
  const roll = ctx.rng.next();

  if (roll < WAVER_CHANCE[band]) {
    ctx.emit({ kind: "fortune", squadId: squad.id, outcome: "waver", ruleId: rule.id });
    return null;
  }
  if (roll > 1 - SURGE_CHANCE[band]) {
    ctx.emit({ kind: "fortune", squadId: squad.id, outcome: "surge", ruleId: rule.id });
    squad.surging = true;
    squad.cohesion = Math.min(100, squad.cohesion + SURGE_COHESION);
    return rule.then.kind === "fallBack" ? heroicStand(rule) : rule;
  }
  return rule;
}

/**
 * Weather: called once at the start of each phase. Phase 1 uses the forecast's
 * starting weather; later phases may shift (seeded). Fortune off: never shifts.
 */
export function phaseStartWeather(ctx: EngineContext) {
  const forecast = ctx.scenario.forecast;
  if (!fortuneOn(ctx) || !forecast || ctx.phase === 1) {
    return;
  }
  const options = forecast.shifts.filter((weather) => weather !== ctx.state.weather);
  if (options.length === 0 || ctx.rng.next() >= forecast.shiftChance) {
    return;
  }
  const to: Weather = options[Math.floor(ctx.rng.next() * options.length)];
  ctx.emit({ kind: "weatherShift", from: ctx.state.weather, to });
  ctx.state.weather = to;
}

/** First contact: the first time two opposing squads engage. Renown & dread both ways. */
export function firstContact(ctx: EngineContext, a: EngineSquad, b: EngineSquad) {
  applyDread(ctx, a, b);
  applyDread(ctx, b, a);
}
