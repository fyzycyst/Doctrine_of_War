// Builds real campaign states by playing battles through the engine: dev boot
// (?campaignAt=N for captures) and tests. Never used by the production flow.
import { applyCampaign, currentBattle, recordBattle, startCampaign, type CampaignDefinition, type CampaignState } from "../../game/campaign";
import { createInitialState, resolvePhase, type EngineState, type FortuneMode, type Orders } from "../../game/engine";
import { scenarioFor } from "./campaignView";

export interface PlayOptions {
  plan?: "intended" | "bad";
  fortune?: FortuneMode;
}

/** Plays the campaign's current battle to its end with a reference plan. */
export function playCurrentBattle(def: CampaignDefinition, state: CampaignState, { plan = "intended", fortune = "off" }: PlayOptions = {}): EngineState {
  const battle = currentBattle(def, state);
  const base = battle ? scenarioFor(battle) : undefined;
  if (!battle || !base) {
    throw new Error("No playable battle to play");
  }
  const scenario = applyCampaign(def, state, base);
  const orders: Orders = scenario.referencePlans?.[plan] ?? {};
  let engine = createInitialState(scenario, { fortune, seed: fortune === "on" ? (scenario.curatedSeed ?? 1) : 1 });
  while (engine.status === "command") {
    engine = resolvePhase(engine, orders, scenario).state;
  }
  return engine;
}

/** A campaign after `battles` battles have been fought (stops at the first unbuilt one). */
export function campaignAfter(def: CampaignDefinition, battles: number, options: PlayOptions = {}): CampaignState {
  let state = startCampaign(def);
  for (let i = 0; i < battles; i += 1) {
    const battle = currentBattle(def, state);
    if (!battle || !scenarioFor(battle)) break;
    state = recordBattle(def, state, playCurrentBattle(def, state, options));
  }
  return state;
}
