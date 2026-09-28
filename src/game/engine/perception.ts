// The perceived world: the single place a squad's DECISIONS read the battlefield
// from. Rule conditions, target selection and tactical movement (fall-back scoring,
// "who bars the way") all go through perceive(); combat, movement blocking and
// zones of control keep using the true state. Under fog (fortune on) the player's
// side only perceives enemies it currently sees, and judges an enemy's support only
// by the enemies it can see. The Host (non-player side) is omniscient for now.
import { hexDistance } from "../board";
import { fortuneOn, type RuleContext } from "./context";
import { alliesOf, enemiesOf, type ActiveSquad } from "./world";

export interface PerceivedWorld {
  self: ActiveSquad;
  /** Enemies this squad's side can see right now (all of them when omniscient). */
  enemies: ActiveSquad[];
  /** Own side, always fully known. */
  allies: ActiveSquad[];
}

export function isOmniscient(ctx: RuleContext, squad: ActiveSquad): boolean {
  return !fortuneOn(ctx) || squad.faction !== ctx.scenario.playerFaction;
}

export function perceive(ctx: RuleContext, squad: ActiveSquad): PerceivedWorld {
  const all = enemiesOf(ctx.state, squad);
  const intel = ctx.state.intel[squad.faction] ?? {};
  return {
    self: squad,
    enemies: isOmniscient(ctx, squad) ? all : all.filter((enemy) => intel[enemy.id]?.visible),
    allies: alliesOf(ctx.state, squad),
  };
}

/** Overextended as far as the perceiver can tell: no enemy it can see stands next to it. */
export function looksOverextended(world: PerceivedWorld, enemy: ActiveSquad): boolean {
  return !world.enemies.some(
    (other) => other.id !== enemy.id && other.faction === enemy.faction && hexDistance(other.hex, enemy.hex) === 1,
  );
}

export function perceivedAdjacentEnemies(world: PerceivedWorld): ActiveSquad[] {
  return world.enemies.filter((enemy) => hexDistance(enemy.hex, world.self.hex) === 1);
}
