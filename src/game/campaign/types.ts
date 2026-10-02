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
  /**
   * Roll campaigns (M1): the company's own strength and cohesion, which it takes into
   * every slot it fills. Must sit inside PROFILE_BANDS for its role. Ignored by fixed
   * (intro) campaigns, where the scenario's authored squad stats apply.
   */
  profile?: CompanyProfile;
  /**
   * Roll campaigns: the id of the battle at which the company joins the Roll (authored
   * arrival; default: the first battle). Fixed campaigns join a company on first use.
   */
  joins?: string;
}

/** A company's own fighting numbers (Roll campaigns). */
export interface CompanyProfile {
  strength: number;
  cohesion: number;
}

/**
 * How a Roll battle is called (M1). The scenario's player squads are the slots (stable
 * slot id = squad id, activation order = squad order, never reordered by selection).
 * `CampaignBattle.slots` is the authored default assignment the recommended force starts from.
 */
export interface BattleCall {
  /**
   * Role-variable ("flex") slots, at most MAX_FLEX_SLOTS per battle: slot id -> the roles
   * a company may have to fill it (the scenario squad's own role first), and the doctrine a
   * company of each role starts on there (the reference-plan template for that role).
   */
  flex?: Record<string, { roles: SquadRole[]; doctrines: Partial<Record<SquadRole, string>> }>;
  /**
   * Story locks, exceptional: slot id -> the company that must fill it. A locked company is
   * fielded even when Reforming (it then fights with the Worn penalty).
   */
  locked?: Record<string, string>;
  /**
   * Authored position names for the selection screen: slot id -> a short plain name of
   * where the post stands ("The Ford Road", "Watcher's Rise"). Never a company's name.
   * Slots without one get a derived name (see RollSlot.label).
   */
  labels?: Record<string, string>;
}

export interface CampaignBattle {
  id: string;
  title: string;
  scenarioId: string;
  /** Roll campaigns only: flex slots and story locks for this battle. */
  call?: BattleCall;
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
  /**
   * "fixed" (default; the intro): every battle fields the companies its `slots` name.
   * "roll" (M1): the player calls companies from the campaign's Roll into each battle's
   * role-typed slots; companies own their profiles; Worn, reserves and carry-over apply.
   */
  mode?: "fixed" | "roll";
  companies: CompanyDefinition[];
  battles: CampaignBattle[];
}

// ---------------------------------------------------------------------------
// State (saved)
// ---------------------------------------------------------------------------

/**
 * Roll campaigns: a company's readiness between battles.
 * - fresh: fields at its profile.
 * - worn: routed, or ended an advancing battle under WORN_BELOW of the strength it took the
 *   field with; fields at -WORN_PENALTY. One advancing battle in reserve makes it fresh.
 * - reforming: destroyed in the last advancing battle it fought; sits out the next advancing
 *   battle (unless story-locked), then returns fresh (at REFORMED_RESOLVE, renown lost).
 */
export type CompanyCondition = "fresh" | "worn" | "reforming";

/** Where a carried company came from (Roll campaigns). */
export interface CarryOrigin {
  packId: string;
  campaignId: string;
}

/**
 * A company brought from a completed campaign, snapshotted into the new campaign's save at
 * its start (M1 carry-over). Replay starts from this snapshot; the source save is never
 * read again. Resolve is clamped to CARRY_RESOLVE; renown is kept.
 */
export interface CarriedCompany {
  id: string;
  name: string;
  role: SquadRole;
  profile: CompanyProfile;
  resolve: number;
  renown: { title: string } | null;
  from: CarryOrigin;
}

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
  /** Roll campaigns only (absent in fixed campaigns and v1 saves). */
  condition?: CompanyCondition;
  /** Roll campaigns only: the profile it fields at (authored, or carried). */
  profile?: CompanyProfile;
  /** Roll campaigns only: present when the company was carried over. */
  carriedFrom?: CarryOrigin;
}

export interface CompanyResult {
  companyId: string;
  squadId: string;
  ended: SquadStatus;
  resolveBefore: number;
  resolveAfter: number;
  /** A renown title earned in this battle, if any. */
  renownEarned: string | null;
  /** Roll campaigns only: the strength it took the field with (profile, minus Worn). */
  startStrength?: number;
  /** Roll campaigns only: its strength when the battle ended (0 when destroyed). Re-derives Worn on replay. */
  endStrength?: number;
  /** Roll campaigns only: a nameless levy filled this slot (no legal company); never settled. */
  levy?: true;
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
  /** Roll campaigns only: who filled each slot (slot id -> company id, or LEVY_ID). */
  assignment?: Assignment;
}

/** Roll campaigns: slot id (scenario player-squad id) -> company id, or LEVY_ID. */
export type Assignment = Record<string, string>;
/** The reserved company id of a nameless levy (never a real company id). */
export const LEVY_ID = "levy";

export type CampaignStatus = "inProgress" | "complete";

export interface CampaignState {
  campaignId: string;
  /** Index into definition.battles of the battle to play next. */
  battleIndex: number;
  status: CampaignStatus;
  /** Every company that has joined, in joining order. */
  companies: CampaignCompany[];
  history: BattleRecord[];
  /** Roll campaigns only: companies carried over at the start (the snapshot replay starts from). */
  carried?: CarriedCompany[];
}
