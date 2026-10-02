// The Roll (M1, P2): later campaigns call companies from the campaign's Roll into each
// battle's role-typed slots. Pure functions over plain data. The intro ("fixed" mode)
// never comes through here and behaves exactly as before.
//
// Per battle:
//   slots = rollSlots(def, state, scenario)              // what must be filled, and by whom it may be
//   roll  = rollFor(def, state)                           // who is on the Roll, ready or not
//   plan  = recommendedForce(def, state, scenario)        // the one-action default
//   problems = validateAssignment(def, state, scenario, assignment)
//   threat = battleThreat(def, state, scenario)          // fixed at battle entry: not a function of the picks
//   engineScenario = assembleBattle(def, state, scenario, assignment)
//   ... play ...
//   state = recordBattle(def, state, final, { assignment })
//
// B2 settlement (Worn, reserves, reform), on ADVANCING results only (victory or stalemate;
// a defeat is retried and changes nobody's readiness):
//   - fielded, destroyed                  -> reforming (today's reform: Resolve -2, renown lost)
//   - fielded, routed                     -> worn
//   - fielded, endStrength < WORN_BELOW x startStrength -> worn
//   - fielded otherwise                   -> keeps its condition (only rest clears Worn)
//   - not fielded (in reserve)            -> fresh (rest clears Worn and Reforming)
//   Precedence: destroyed > routed > under strength.
//   Reforming companies cannot be assigned, except to a slot that story-locks them (they
//   then fight with the Worn penalty). Worn companies may be assigned, at the penalty.
//   Legal force: a slot no ready company can fill takes a nameless levy (LEVY_ID; profile
//   LEVY_PROFILE for its role, Resolve -1, no renown, never settled); a levy is legal only
//   where it is forced.
import type { EngineScenario, EngineState, SquadRole } from "../engine/types";
import type { HostEscalation } from "./campaign";
import type {
  Assignment,
  CampaignDefinition,
  CampaignState,
  CarriedCompany,
  CampaignCompany,
  CompanyCondition,
  CompanyProfile,
} from "./types";

/** At most this many role-variable slots per battle. */
export const MAX_FLEX_SLOTS = 2;
/** A Worn company fields this much weaker. Tunable. */
export const WORN_PENALTY: CompanyProfile = { strength: 15, cohesion: 10 };
/** Ending an advancing battle under this share of its starting strength makes a company Worn. */
export const WORN_BELOW = 0.5;
/** At most this many companies carry over from a completed campaign. */
export const CARRY_OVER_MAX = 5;
/** Carried Resolve is clamped to this range. */
export const CARRY_RESOLVE = { min: -1, max: 2 } as const;
/** Resolve of a nameless levy. */
export const LEVY_RESOLVE = -1;

/**
 * Per-role lint band for company profiles: a few transparent trade-offs, never a different
 * kind of company. Derived from the shipped intro squads with a little headroom.
 */
export const PROFILE_BANDS: Record<SquadRole, { strength: [number, number]; cohesion: [number, number] }> = {
  frontline: { strength: [68, 90], cohesion: [60, 80] },
  skirmish: { strength: [58, 72], cohesion: [62, 74] },
  support: { strength: [46, 58], cohesion: [76, 86] },
  cavalry: { strength: [62, 78], cohesion: [60, 72] },
  siege: { strength: [60, 100], cohesion: [50, 80] },
};

/** The profile a levy fields at: the bottom of its role's band. */
export const LEVY_PROFILE: Record<SquadRole, CompanyProfile> = Object.fromEntries(
  Object.entries(PROFILE_BANDS).map(([role, band]) => [role, { strength: band.strength[0], cohesion: band.cohesion[0] }]),
) as Record<SquadRole, CompanyProfile>;

/** The Host's adjustment for a battle, fixed at entry (same shape as the intro's escalation). */
export type HostThreat = HostEscalation;

/** One slot of a Roll battle, as the selection screen shows it. */
export interface RollSlot {
  /** Stable slot id: the scenario player-squad id. Slots come in activation order. */
  slotId: string;
  /** The scenario's label for the post (its squad name). */
  label: string;
  /** Roles that may fill it; more than one only on a flex slot. */
  roles: SquadRole[];
  flex: boolean;
  /** A story-locked company, or null. */
  locked: string | null;
  /** The doctrine a company starts on here, per role it may have. */
  doctrines: Partial<Record<SquadRole, string>>;
}

/** One company on the Roll for the current battle. */
export interface RollEntry {
  company: CampaignCompany;
  condition: CompanyCondition;
  /** Can be assigned to some slot this battle (not Reforming, or story-locked). */
  available: boolean;
  /** Plain-language reason when not available ("Reforming: sits out this battle."). */
  unavailableReason: string | null;
  /** What it would field at: its profile, minus WORN_PENALTY when Worn. */
  fielded: CompanyProfile;
}

/** Plain-language problems per slot id (or "assignment"); empty when the assignment is legal. */
export type AssignmentProblems = Record<string, string>;

const pending = (name: string): never => {
  throw new Error(`${name}: not implemented yet (M1 P2)`);
};

/** True when the campaign is fought from the Roll ("roll" mode). */
export function isRollCampaign(def: CampaignDefinition): boolean {
  return def.mode === "roll";
}

/**
 * The companies a completed campaign can lend the next one: every company on its final Roll
 * (not levies), snapshotted with Resolve clamped to CARRY_RESOLVE and renown kept.
 * Empty when `state` is not complete.
 */
export function carryOverCandidates(_def: CampaignDefinition, _state: CampaignState, _packId: string): CarriedCompany[] {
  return pending("carryOverCandidates");
}

/**
 * The player's carry-over pick, validated (at most CARRY_OVER_MAX, distinct, each a
 * candidate of a complete campaign, no id clash with `target`'s own companies). Throws
 * with a plain-language reason when it is not legal.
 */
export function snapshotCarryOver(
  _source: { def: CampaignDefinition; state: CampaignState; packId: string },
  _target: CampaignDefinition,
  _companyIds: string[],
): CarriedCompany[] {
  return pending("snapshotCarryOver");
}

/** Everyone on the Roll for the current battle (arrivals so far, plus carried companies), in Roll order. */
export function rollFor(_def: CampaignDefinition, _state: CampaignState): RollEntry[] {
  return pending("rollFor");
}

/** The current battle's slots, in activation order. */
export function rollSlots(_def: CampaignDefinition, _state: CampaignState, _scenario: EngineScenario): RollSlot[] {
  return pending("rollSlots");
}

/**
 * The one-action default: the authored assignment where those companies are ready, else
 * the readiest company of the slot's role (fresh before Worn, then Resolve, then Roll
 * order), else a levy. Always legal.
 */
export function recommendedForce(_def: CampaignDefinition, _state: CampaignState, _scenario: EngineScenario): Assignment {
  return pending("recommendedForce");
}

/** Plain-language problems with a proposed assignment; empty when it is legal. */
export function validateAssignment(
  _def: CampaignDefinition,
  _state: CampaignState,
  _scenario: EngineScenario,
  _assignment: Assignment,
): AssignmentProblems {
  return pending("validateAssignment");
}

/**
 * The Host's adjustment for the current battle, from the RECOMMENDED force and the campaign
 * state at battle entry (bounded like the intro's escalation). It does not depend on the
 * player's picks, and a defeat leaves it unchanged, so it is fixed through selection and retries.
 */
export function battleThreat(_def: CampaignDefinition, _state: CampaignState, _scenario: EngineScenario): HostThreat {
  return pending("battleThreat");
}

/**
 * The scenario as this assignment fights it. Pure. Squad order is kept; each slot squad
 * takes its company's id-independent identity (name, role, profile minus Worn, Resolve,
 * renown, and the role's doctrine on a flex slot); the Host takes battleThreat().
 * Throws when the assignment is not legal.
 */
export function assembleBattle(
  _def: CampaignDefinition,
  _state: CampaignState,
  _scenario: EngineScenario,
  _assignment: Assignment,
): EngineScenario {
  return pending("assembleBattle");
}

/**
 * Roll-campaign settlement of a finished battle (called by recordBattle for "roll"
 * campaigns): Resolve and renown as in the intro, plus conditions, start and end strength,
 * and the assignment in the record.
 */
export function recordRollBattle(
  _def: CampaignDefinition,
  _state: CampaignState,
  _final: EngineState,
  _assignment: Assignment,
  _options: { customOrders?: boolean } = {},
): CampaignState {
  return pending("recordRollBattle");
}

/**
 * Authoring lint for a Roll campaign against its scenarios: profiles inside their role
 * band, at most MAX_FLEX_SLOTS flex slots per battle with a doctrine per role, locks and
 * arrivals that exist, and every authored default assignment legal on the curated path.
 */
export function lintRollCampaign(_def: CampaignDefinition, _scenarios: EngineScenario[]): string[] {
  return pending("lintRollCampaign");
}
