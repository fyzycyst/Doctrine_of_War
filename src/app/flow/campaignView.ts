// Pure helpers that turn campaign state into what the campaign map and ledger show.
import {
  currentBattle,
  rosterFor,
  type BattleRecord,
  type CampaignBattle,
  type CampaignCompany,
  type CampaignDefinition,
  type CampaignState,
} from "../../game/campaign";
import type { EngineScenario } from "../../game/engine";
import { packs } from "../roll/api";
import { lightingFor } from "../../render/fromEngine";
import type { CampaignIslandStatus, CampaignMapBattle } from "../../render/showcase/CampaignMap";
import type { PlaceholderKind } from "../../render/showcase/placeholderBoards";

/** The engine scenario a campaign battle is fought on, once it has been built (from any pack). */
export function scenarioFor(battle: CampaignBattle): EngineScenario | undefined {
  return battle.placeholder ? undefined : packs().scenario(battle.scenarioId);
}

/** A battle the player can fight now: it is the current one and its scenario exists. */
export function isPlayable(def: CampaignDefinition, state: CampaignState, battleId: string): boolean {
  const battle = currentBattle(def, state);
  return battle?.id === battleId && scenarioFor(battle) !== undefined;
}

const PLACEHOLDER: Record<string, { kind: PlaceholderKind; timeOfDay: CampaignMapBattle["timeOfDay"] }> = {
  saltmarsh_column: { kind: "saltmarsh", timeOfDay: "rainGrey" },
  hold_for_dawn: { kind: "holdForDawn", timeOfDay: "predawn" },
};

function lastRecord(state: CampaignState, battleId: string): BattleRecord | undefined {
  return [...state.history].reverse().find((record) => record.battleId === battleId);
}

export function islandStatus(def: CampaignDefinition, state: CampaignState, index: number): CampaignIslandStatus {
  const battle = def.battles[index];
  const last = lastRecord(state, battle.id);
  if (index < state.battleIndex || state.status === "complete") {
    return last?.outcome === "stalemate" ? "stalemate" : "won";
  }
  if (index === state.battleIndex) {
    return last?.outcome === "defeat" ? "lost" : "current";
  }
  return "locked";
}

/** The archipelago: one island per battle, with a placeholder island for unbuilt battles. */
export function mapBattles(def: CampaignDefinition, state: CampaignState): CampaignMapBattle[] {
  return def.battles.map((battle, index) => {
    const scenario = scenarioFor(battle);
    const placeholder = PLACEHOLDER[battle.scenarioId];
    return {
      id: battle.id,
      title: scenario ? battle.title : `${battle.title} (coming soon)`,
      status: islandStatus(def, state, index),
      timeOfDay: scenario ? lightingFor(scenario.timeOfDay) : (placeholder?.timeOfDay ?? "dusk"),
      ...(scenario ? { board: scenario.board } : { placeholder: placeholder?.kind ?? "saltmarsh" }),
    };
  });
}

/**
 * The army ledger: every company that has joined, plus (before they have fought)
 * the companies the next battle will muster, so a new campaign is never empty.
 */
export function ledger(def: CampaignDefinition, state: CampaignState): { companies: CampaignCompany[]; mustering: boolean } {
  const battle = currentBattle(def, state);
  if (!battle || battle.placeholder) {
    return { companies: state.companies, mustering: false };
  }
  const roster = rosterFor(def, state, battle);
  return { companies: roster, mustering: roster.length > state.companies.length };
}

export const OUTCOME_WORD: Record<BattleRecord["outcome"], string> = {
  victory: "Victory",
  defeat: "Defeat",
  stalemate: "Stalemate",
};

export function battleTitle(def: CampaignDefinition, battleId: string): string {
  return def.battles.find((battle) => battle.id === battleId)?.title ?? battleId;
}
