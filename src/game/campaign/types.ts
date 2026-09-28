// Campaign schema. Pure JSON data: the definition is authored content, the state
// is what gets saved. No functions, Dates or class instances.
import type { BattleOutcome, SquadRole, SquadStatus } from "../engine/types";

export const RESOLVE_MIN = -3;
export const RESOLVE_MAX = 3;

// ---------------------------------------------------------------------------
// Definition (authored)
// ---------------------------------------------------------------------------

export interface CompanyDefinition {
  id: string;
  name: string;
  role: SquadRole;
  /** Resolve when the company first joins. Default 0 ("fresh"). */
  startingResolve?: number;
}

export interface CampaignBattle {
  id: string;
  title: string;
  scenarioId: string;
  /** Content not built yet: the campaign shows it but it cannot be played. */
  placeholder?: boolean;
  /**
   * Roster continuity: scenario player-squad id -> campaign company id. Every player
   * squad in the scenario is mapped, roles must match, and a company fills at most
   * one slot per battle. The company lends the squad its name, Resolve and renown.
   */
  slots: Record<string, string>;
}

export interface CampaignDefinition {
  id: string;
  title: string;
  companies: CompanyDefinition[];
  battles: CampaignBattle[];
}

// ---------------------------------------------------------------------------
// State (saved)
// ---------------------------------------------------------------------------

export interface CampaignCompany {
  id: string;
  name: string;
  role: SquadRole;
  resolve: number;
  /** Earned on reaching Resolve +3; kept until the company is destroyed and reforms. */
  renown: { title: string } | null;
  battlesFought: number;
  /** Times the company ended a battle routed or destroyed. */
  casualties: { routed: number; destroyed: number };
  /** Times it was destroyed and raised again at REFORMED_RESOLVE. */
  reformed: number;
}

export interface CompanyResult {
  companyId: string;
  squadId: string;
  ended: SquadStatus;
  resolveBefore: number;
  resolveAfter: number;
  /** A renown title earned in this battle, if any. */
  renownEarned: string | null;
}

export interface BattleRecord {
  battleId: string;
  scenarioId: string;
  /** 1 for the first try; retries after a defeat count up. */
  attempt: number;
  outcome: BattleOutcome;
  seed: number;
  phasesPlayed: number;
  companiesBroken: number;
  enemyBroken: number;
  /** Final integrity of the player's objective, when the battle has one. */
  objectiveIntegrity: number | null;
  companies: CompanyResult[];
  /** Present (true) when the player fought with custom orders: a doctrine variant (T16). No penalty; history only. */
  customOrders?: true;
}

export type CampaignStatus = "inProgress" | "complete";

export interface CampaignState {
  campaignId: string;
  /** Index into definition.battles of the battle to play next. */
  battleIndex: number;
  status: CampaignStatus;
  /** Every company that has joined, in joining order. */
  companies: CampaignCompany[];
  history: BattleRecord[];
}
