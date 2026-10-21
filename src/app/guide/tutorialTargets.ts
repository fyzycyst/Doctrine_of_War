// The tutorial's second phase points at real companies (T32): read from the live battle, never
// hard-coded, so it works in any first battle and with any fortune. Uses the same player-view
// muster checks the muster UI does (musterTargets → the engine's musterOptions/validateMuster).
import type { EngineScenario, EngineState, MusterMove } from "../../game/engine";
import { isRelief, musterTargets } from "../game/muster";

export interface TutorialTargets {
  /** The player's companies that broke (routed or destroyed) so far: their cohesion reached 0. */
  broke: string[];
  /** The company whose cohesion fell most in the battle so far (null if none fell). */
  tired: { squadId: string; cohesion: number; from: number } | null;
  /** A fresh company that can relieve a company in contact (null if none can, this phase). */
  relief: { reliever: string; tired: string } | null;
  /** A company free to muster somewhere (not the relief's two), or null. */
  mover: { squadId: string; reach: number } | null;
}

/** The player's companies still fighting (not the Column: it keeps its own orders). */
function ownActive(engine: EngineState, scenario: EngineScenario) {
  return engine.squads.filter((squad) => squad.faction === scenario.playerFaction && squad.status === "active" && !squad.noncombatant && squad.hex);
}

export function tutorialTargets(engine: EngineState, scenario: EngineScenario, plan: MusterMove[]): TutorialTargets {
  const own = ownActive(engine, scenario);
  const start = (id: string) => scenario.squads.find((squad) => squad.id === id)?.cohesion ?? 0;
  // Who has lost nerve, most first.
  const tiring = own
    .map((squad) => ({ squadId: squad.id, cohesion: Math.round(squad.cohesion), from: start(squad.id) }))
    .filter((item) => item.cohesion < item.from)
    .sort((a, b) => a.cohesion - a.from - (b.cohesion - b.from));
  // Plans the player already made count: a company already relieving is the relief shown.
  const planned = plan.find(isRelief);
  const relievers = own.flatMap((squad) => musterTargets(engine, scenario, plan, squad.id).relieve.map((tired) => ({ reliever: squad.id, tired })));
  const tiredFirst = (pair: { tired: string }) => {
    const at = tiring.findIndex((item) => item.squadId === pair.tired);
    return at < 0 ? tiring.length : at;
  };
  const relief = planned ? { reliever: planned.squadId, tired: planned.relieve } : ([...relievers].sort((a, b) => tiredFirst(a) - tiredFirst(b))[0] ?? null);
  // One story: the tired company shown is the one that can be relieved, when its nerve fell.
  // Never the reliever, when another has lost nerve (a tired company doesn't rest another).
  const tired = tiring.find((item) => item.squadId === relief?.tired) ?? tiring.find((item) => item.squadId !== relief?.reliever) ?? tiring[0] ?? null;
  const busy = new Set(relief ? [relief.reliever, relief.tired] : []);
  const free = own.find((squad) => !busy.has(squad.id) && musterTargets(engine, scenario, plan, squad.id).hexes.length > 0);
  return {
    broke: engine.squads.filter((squad) => squad.faction === scenario.playerFaction && !squad.noncombatant && (squad.status === "routed" || squad.status === "destroyed")).map((squad) => squad.id),
    tired,
    relief,
    mover: free ? { squadId: free.id, reach: free.role === "cavalry" ? 2 : 1 } : null,
  };
}
