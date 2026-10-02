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
//   - fielded otherwise                   -> keeps its condition (only rest clears Worn); a
//                                            story-locked Reforming company that fought is Worn
//   - not fielded (in reserve)            -> fresh (rest clears Worn and Reforming)
//   Precedence: destroyed > routed > under strength.
//   Reforming companies cannot be assigned, except to a slot that story-locks them (they
//   then fight with the Worn penalty). Worn companies may be assigned, at the penalty.
//   Legal force: a slot no ready company can fill takes a nameless levy (LEVY_ID; profile
//   LEVY_PROFILE for its role, Resolve -1, no renown, never settled); a levy is legal only
//   where it is forced.
import type { EngineScenario, EngineState, SquadRole, SquadSetup } from "../engine/types";
import { clampResolve, fameOf, hostEscalation, playableBattle, settleCompany, type HostEscalation } from "./campaign";
import {
  LEVY_ID,
  RESOLVE_MAX,
  RESOLVE_MIN,
  type Assignment,
  type BattleRecord,
  type CampaignBattle,
  type CampaignCompany,
  type CampaignDefinition,
  type CampaignState,
  type CarriedCompany,
  type CompanyCondition,
  type CompanyProfile,
  type CompanyResult,
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


const ROLE_WORD: Record<SquadRole, string> = {
  frontline: "Frontline",
  skirmish: "Skirmish",
  support: "Support",
  cavalry: "Cavalry",
  siege: "Siege",
};

/** True when the campaign is fought from the Roll ("roll" mode). */
export function isRollCampaign(def: CampaignDefinition): boolean {
  return def.mode === "roll";
}

function requireRoll(def: CampaignDefinition, name: string) {
  if (!isRollCampaign(def)) throw new Error(`${name}: campaign ${def.id} is not fought from the Roll`);
}

/** The scenario's slot squads (the player's companies), in activation order. */
function slotSquads(scenario: EngineScenario): SquadSetup[] {
  return scenario.squads.filter((squad) => squad.faction === scenario.playerFaction && !squad.noncombatant);
}

function battleIndexOf(def: CampaignDefinition, battleId: string | undefined): number {
  if (battleId === undefined) return 0;
  const index = def.battles.findIndex((battle) => battle.id === battleId);
  return index < 0 ? Number.POSITIVE_INFINITY : index;
}

function freshCompany(company: { id: string; name: string; role: SquadRole; resolve: number; renown: { title: string } | null; profile: CompanyProfile }, carriedFrom?: CarriedCompany["from"]): CampaignCompany {
  return {
    id: company.id,
    name: company.name,
    role: company.role,
    resolve: clampResolve(company.resolve),
    renown: company.renown ? { title: company.renown.title } : null,
    battlesFought: 0,
    casualties: { routed: 0, destroyed: 0 },
    reformed: 0,
    condition: "fresh",
    profile: { ...company.profile },
    ...(carriedFrom ? { carriedFrom: { ...carriedFrom } } : {}),
  };
}

/**
 * The Roll at the current battle: companies already on it (state.companies), then any
 * carried company and any authored arrival due by now that has not joined yet. Clones.
 * Order: carried companies first (they march in at the start), then authored arrivals.
 */
export function rollRoster(def: CampaignDefinition, state: CampaignState): CampaignCompany[] {
  const roster = state.companies.map((company) => structuredClone(company));
  const has = (companyId: string) => roster.some((company) => company.id === companyId);
  for (const carried of state.carried ?? []) {
    if (!has(carried.id)) roster.push(freshCompany(carried, carried.from));
  }
  for (const company of def.companies) {
    if (has(company.id) || battleIndexOf(def, company.joins) > state.battleIndex) continue;
    if (!company.profile) throw new Error(`Campaign ${def.id}: company ${company.id} has no profile`);
    roster.push(freshCompany({ ...company, resolve: company.startingResolve ?? 0, renown: null, profile: company.profile }));
  }
  return roster;
}

function conditionOf(company: CampaignCompany): CompanyCondition {
  return company.condition ?? "fresh";
}

/** The profile a company fields at: its own, minus WORN_PENALTY when Worn (or Reforming and locked in). */
function fieldedProfile(company: CampaignCompany): CompanyProfile {
  const profile = company.profile ?? { strength: 50, cohesion: 50 };
  const weak = conditionOf(company) !== "fresh";
  return weak
    ? { strength: Math.max(1, profile.strength - WORN_PENALTY.strength), cohesion: Math.max(1, profile.cohesion - WORN_PENALTY.cohesion) }
    : { ...profile };
}

/** Everyone on the Roll for the current battle (arrivals so far, plus carried companies), in Roll order. */
export function rollFor(def: CampaignDefinition, state: CampaignState): RollEntry[] {
  requireRoll(def, "rollFor");
  return rollRoster(def, state).map((company) => {
    const condition = conditionOf(company);
    const reforming = condition === "reforming";
    return {
      company,
      condition,
      available: !reforming,
      unavailableReason: reforming ? "Reforming: sits out this battle." : null,
      fielded: fieldedProfile(company),
    };
  });
}

function battleFor(def: CampaignDefinition, state: CampaignState, scenario: EngineScenario): CampaignBattle {
  requireRoll(def, "Roll");
  return playableBattle(def, state, scenario.id);
}

function slotsOf(battle: CampaignBattle, scenario: EngineScenario): RollSlot[] {
  return slotSquads(scenario).map((squad) => {
    const flex = battle.call?.flex?.[squad.id];
    return {
      slotId: squad.id,
      label: squad.name,
      roles: flex ? [...flex.roles] : [squad.role],
      flex: Boolean(flex),
      locked: battle.call?.locked?.[squad.id] ?? null,
      doctrines: flex ? { ...flex.doctrines } : { [squad.role]: squad.doctrineId },
    };
  });
}

/** The current battle's slots, in activation order. */
export function rollSlots(def: CampaignDefinition, state: CampaignState, scenario: EngineScenario): RollSlot[] {
  return slotsOf(battleFor(def, state, scenario), scenario);
}

/** Readiness rank for recommendations: fresh before Worn, then fame (Resolve, renown). */
function readiness(company: CampaignCompany): number {
  return (conditionOf(company) === "fresh" ? 100 : 0) + company.resolve * 3 + (company.renown ? 2 : 0);
}

function eligible(company: CampaignCompany, slot: RollSlot): boolean {
  if (!slot.roles.includes(company.role)) return false;
  return conditionOf(company) !== "reforming" || slot.locked === company.id;
}

/**
 * The one-action default, always legal: story locks first; then each single-role slot,
 * then each flex slot, takes the readiest unused company it allows (fresh before Worn,
 * then Resolve and renown; ties go to the slot's authored company, then Roll order);
 * a slot nobody can fill takes a levy. Carried companies are recommended like any other.
 */
export function recommendedForce(def: CampaignDefinition, state: CampaignState, scenario: EngineScenario): Assignment {
  const battle = battleFor(def, state, scenario);
  const roster = rollRoster(def, state);
  const slots = slotsOf(battle, scenario);
  const used = new Set<string>();
  const assignment: Assignment = {};
  for (const slot of slots) {
    if (slot.locked && roster.some((company) => company.id === slot.locked)) {
      assignment[slot.slotId] = slot.locked;
      used.add(slot.locked);
    }
  }
  const order = [...slots.filter((slot) => !slot.flex), ...slots.filter((slot) => slot.flex)];
  for (const slot of order) {
    if (assignment[slot.slotId]) continue;
    const authored = battle.slots[slot.slotId];
    const best = roster
      .map((company, index) => ({ company, index }))
      .filter(({ company }) => !used.has(company.id) && eligible(company, slot))
      .sort(
        (a, b) =>
          readiness(b.company) - readiness(a.company) ||
          Number(b.company.id === authored) - Number(a.company.id === authored) ||
          a.index - b.index,
      )[0];
    assignment[slot.slotId] = best ? best.company.id : LEVY_ID;
    if (best) used.add(best.company.id);
  }
  return Object.fromEntries(slots.map((slot) => [slot.slotId, assignment[slot.slotId]]));
}

function problemsFor(battle: CampaignBattle, scenario: EngineScenario, roster: CampaignCompany[], assignment: Assignment): AssignmentProblems {
  const problems: AssignmentProblems = {};
  const slots = slotsOf(battle, scenario);
  const extra = Object.keys(assignment).filter((slotId) => !slots.some((slot) => slot.slotId === slotId));
  if (extra.length > 0) problems.assignment = `No such post: ${extra.join(", ")}.`;
  const seen = new Map<string, string>();
  for (const slot of slots) {
    const companyId = assignment[slot.slotId];
    const refuse = (reason: string) => (problems[slot.slotId] ??= reason);
    if (!companyId) {
      refuse(`${slot.label} has no company.`);
      continue;
    }
    if (slot.locked && companyId !== slot.locked) {
      const locked = roster.find((company) => company.id === slot.locked);
      refuse(`${locked?.name ?? slot.locked} must hold ${slot.label}.`);
      continue;
    }
    if (companyId === LEVY_ID) continue; // judged below, once every company is placed
    const company = roster.find((item) => item.id === companyId);
    if (!company) {
      refuse("That company is not on the Roll.");
      continue;
    }
    const first = seen.get(companyId);
    if (first) {
      refuse(`${company.name} already holds another post.`);
      continue;
    }
    seen.set(companyId, slot.slotId);
    if (!slot.roles.includes(company.role)) {
      refuse(`${company.name} (${ROLE_WORD[company.role].toLowerCase()}) cannot hold a ${slot.roles.map((role) => ROLE_WORD[role].toLowerCase()).join(" or ")} post.`);
      continue;
    }
    if (conditionOf(company) === "reforming" && slot.locked !== company.id) {
      refuse(`${company.name} is reforming and sits out this battle.`);
    }
  }
  // A levy only where it is forced: no ready company left unplaced could hold that post.
  for (const slot of slots) {
    if (assignment[slot.slotId] !== LEVY_ID || problems[slot.slotId]) continue;
    const spare = roster.find((company) => !seen.has(company.id) && eligible(company, slot));
    if (spare) problems[slot.slotId] = `${spare.name} could hold ${slot.label}; a levy is only raised when no company can.`;
  }
  return problems;
}

/** Plain-language problems with a proposed assignment; empty when it is legal. */
export function validateAssignment(def: CampaignDefinition, state: CampaignState, scenario: EngineScenario, assignment: Assignment): AssignmentProblems {
  return problemsFor(battleFor(def, state, scenario), scenario, rollRoster(def, state), assignment);
}

/** Fame of an assignment's companies (levies count at LEVY_RESOLVE). */
function fielded(roster: CampaignCompany[], assignment: Assignment) {
  return Object.values(assignment).map((companyId) =>
    companyId === LEVY_ID ? { resolve: LEVY_RESOLVE, renown: null } : roster.find((company) => company.id === companyId)!,
  );
}

/**
 * The Host's adjustment for the current battle, from the RECOMMENDED force and the campaign
 * state at battle entry (bounded like the intro's escalation), against the scenario's
 * authored fame. It does not depend on the player's picks, and a defeat leaves the state it
 * reads unchanged, so it is fixed through selection and retries.
 */
export function battleThreat(def: CampaignDefinition, state: CampaignState, scenario: EngineScenario): HostThreat {
  const roster = rollRoster(def, state);
  const recommended = recommendedForce(def, state, scenario);
  return hostEscalation(fielded(roster, recommended), fameOf(slotSquads(scenario)));
}

/**
 * The scenario as this assignment fights it. Pure. Squad order and slot ids are kept; each
 * slot squad takes its company's name, role, fielded profile (Worn penalty included),
 * Resolve and renown, and on a flex slot the doctrine for that role; a levy takes the
 * bottom of its role's band at LEVY_RESOLVE; the Host takes battleThreat().
 * Throws when the assignment is not legal.
 */
export function assembleBattle(def: CampaignDefinition, state: CampaignState, scenario: EngineScenario, assignment: Assignment): EngineScenario {
  const battle = battleFor(def, state, scenario);
  const roster = rollRoster(def, state);
  const problems = problemsFor(battle, scenario, roster, assignment);
  const first = Object.entries(problems)[0];
  if (first) throw new Error(`Invalid assignment for ${first[0]}: ${first[1]}`);
  const threat = battleThreat(def, state, scenario);
  const slots = new Map(slotsOf(battle, scenario).map((slot) => [slot.slotId, slot]));
  return {
    ...structuredClone(scenario),
    squads: scenario.squads.map((squad) => {
      if (squad.faction !== scenario.playerFaction) {
        return {
          ...structuredClone(squad),
          strength: Math.max(10, Math.min(100, squad.strength + threat.strength)),
          resolve: Math.max(RESOLVE_MIN, Math.min(RESOLVE_MAX, squad.resolve + threat.resolve)),
        };
      }
      const slot = slots.get(squad.id);
      if (!slot) return structuredClone(squad); // a noncombatant
      const { renown: _authored, ...rest } = structuredClone(squad);
      const companyId = assignment[squad.id];
      if (companyId === LEVY_ID) {
        const role = slot.roles[0];
        return {
          ...rest,
          name: `${ROLE_WORD[role]} Levy`,
          role,
          ...LEVY_PROFILE[role],
          resolve: LEVY_RESOLVE,
          doctrineId: slot.doctrines[role] ?? squad.doctrineId,
        };
      }
      const company = roster.find((item) => item.id === companyId)!;
      return {
        ...rest,
        name: company.name,
        role: company.role,
        ...fieldedProfile(company),
        resolve: company.resolve,
        doctrineId: slot.doctrines[company.role] ?? squad.doctrineId,
        ...(company.renown ? { renown: { title: company.renown.title } } : {}),
      };
    }),
  };
}

/** A fielded company's condition after an advancing battle (B2). */
export function conditionAfter(previous: CompanyCondition, ended: CompanyResult["ended"], startStrength: number, endStrength: number): CompanyCondition {
  if (ended === "destroyed") return "reforming";
  if (ended === "routed") return "worn";
  if (endStrength < WORN_BELOW * startStrength) return "worn";
  return previous === "fresh" ? "fresh" : "worn";
}

/**
 * Settles one battle's results into `roster` (in place) and returns the slot results.
 * Shared by recordRollBattle and save replay, so both apply exactly the same rules.
 * `results` gives, per slot in activation order, how the squad ended and its end strength.
 */
export function settleRollBattle(
  roster: CampaignCompany[],
  assignment: Assignment,
  outcome: BattleRecord["outcome"],
  results: { squadId: string; ended: CompanyResult["ended"]; startStrength: number; endStrength: number }[],
): CompanyResult[] {
  const lines: CompanyResult[] = [];
  const fieldedIds = new Set<string>();
  for (const line of results) {
    const companyId = assignment[line.squadId];
    if (companyId === LEVY_ID) {
      lines.push({
        companyId: LEVY_ID,
        squadId: line.squadId,
        ended: line.ended,
        resolveBefore: LEVY_RESOLVE,
        resolveAfter: LEVY_RESOLVE,
        renownEarned: null,
        startStrength: line.startStrength,
        endStrength: line.endStrength,
        levy: true,
      });
      continue;
    }
    const company = roster.find((item) => item.id === companyId);
    if (!company) throw new Error(`Company ${companyId} is not on the Roll`);
    fieldedIds.add(company.id);
    const before = company.resolve;
    const previous = conditionOf(company);
    const renownEarned = settleCompany(roster, company, line.ended, outcome);
    if (outcome !== "defeat") company.condition = conditionAfter(previous, line.ended, line.startStrength, line.endStrength);
    lines.push({
      companyId,
      squadId: line.squadId,
      ended: line.ended,
      resolveBefore: before,
      resolveAfter: company.resolve,
      renownEarned,
      startStrength: line.startStrength,
      endStrength: line.endStrength,
    });
  }
  if (outcome !== "defeat") {
    // Rest: one advancing battle in reserve clears Worn and Reforming.
    for (const company of roster) if (!fieldedIds.has(company.id)) company.condition = "fresh";
  }
  return lines;
}

/**
 * Roll-campaign settlement of a finished battle (recordBattle routes here for "roll"
 * campaigns): Resolve and renown as in the intro, plus conditions, start and end strength,
 * and the assignment in the record. The assignment must be the legal one that was played.
 */
export function recordRollBattle(
  def: CampaignDefinition,
  state: CampaignState,
  final: EngineState,
  assignment: Assignment,
  options: { customOrders?: boolean } = {},
): CampaignState {
  requireRoll(def, "recordRollBattle");
  const battle = playableBattle(def, state, final.scenarioId);
  if (final.status === "command") throw new Error(`Battle ${battle.id} is not over yet`);
  const outcome = final.status;
  const roster = rollRoster(def, state);
  const slotIds = Object.keys(battle.slots);
  const results = slotIds.map((squadId) => {
    const squad = final.squads.find((item) => item.id === squadId);
    if (!squad) throw new Error(`Battle ${battle.id}: squad ${squadId} is missing`);
    const companyId = assignment[squadId];
    if (companyId === undefined) throw new Error(`Battle ${battle.id}: slot ${squadId} has no company`);
    const company = roster.find((item) => item.id === companyId);
    const startStrength = companyId === LEVY_ID ? LEVY_PROFILE[squad.role].strength : fieldedProfile(company!).strength;
    return { squadId, ended: squad.status, startStrength, endStrength: squad.strength };
  });
  const lines = settleRollBattle(roster, assignment, outcome, results);

  const player = final.squads.filter((squad) => slotIds.includes(squad.id));
  const enemies = final.squads.filter((squad) => player.every((p) => p.faction !== squad.faction));
  const defended = final.objectives.find((objective) => player.some((squad) => squad.faction === objective.defender));
  const record: BattleRecord = {
    battleId: battle.id,
    scenarioId: battle.scenarioId,
    attempt: state.history.filter((item) => item.battleId === battle.id).length + 1,
    outcome,
    seed: final.seed,
    phasesPlayed: final.phase,
    companiesBroken: player.filter((squad) => squad.status === "routed" || squad.status === "destroyed").length,
    enemyBroken: enemies.filter((squad) => squad.status === "routed" || squad.status === "destroyed").length,
    objectiveIntegrity: defended ? defended.integrity : null,
    companies: lines,
    ...(options.customOrders ? { customOrders: true as const } : {}),
    assignment: Object.fromEntries(slotIds.map((slotId) => [slotId, assignment[slotId]])),
  };
  const battleIndex = outcome === "defeat" ? state.battleIndex : state.battleIndex + 1;
  return {
    campaignId: state.campaignId,
    battleIndex,
    status: battleIndex >= def.battles.length ? "complete" : "inProgress",
    companies: roster,
    history: [...state.history, record],
    ...(state.carried ? { carried: structuredClone(state.carried) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Carry-over
// ---------------------------------------------------------------------------

/**
 * The companies a completed campaign can lend the next one: every company on its final
 * roster that has a profile (its own, or its definition's), snapshotted with Resolve
 * clamped to CARRY_RESOLVE and renown kept. Empty when `state` is not complete.
 */
export function carryOverCandidates(def: CampaignDefinition, state: CampaignState, packId: string): CarriedCompany[] {
  if (state.status !== "complete" || state.campaignId !== def.id) return [];
  return state.companies.flatMap((company) => {
    const profile = company.profile ?? def.companies.find((item) => item.id === company.id)?.profile;
    if (!profile) return [];
    return [
      {
        id: company.id,
        name: company.name,
        role: company.role,
        profile: { ...profile },
        resolve: Math.max(CARRY_RESOLVE.min, Math.min(CARRY_RESOLVE.max, company.resolve)),
        renown: company.renown ? { title: company.renown.title } : null,
        from: company.carriedFrom ? { ...company.carriedFrom } : { packId, campaignId: def.id },
      },
    ];
  });
}

/**
 * The player's carry-over pick, validated (at most CARRY_OVER_MAX, distinct, each a
 * candidate of a complete campaign, no id clash with `target`'s own companies). Throws
 * with a plain-language reason when it is not legal.
 */
export function snapshotCarryOver(
  source: { def: CampaignDefinition; state: CampaignState; packId: string },
  target: CampaignDefinition,
  companyIds: string[],
): CarriedCompany[] {
  if (!isRollCampaign(target)) throw new Error(`${target.title} does not take companies from other campaigns.`);
  if (source.state.status !== "complete") throw new Error(`${source.def.title} is not complete yet.`);
  if (companyIds.length > CARRY_OVER_MAX) throw new Error(`At most ${CARRY_OVER_MAX} companies can march on.`);
  if (new Set(companyIds).size !== companyIds.length) throw new Error("A company can only be chosen once.");
  const candidates = carryOverCandidates(source.def, source.state, source.packId);
  return companyIds.map((companyId) => {
    const candidate = candidates.find((item) => item.id === companyId);
    if (!candidate) throw new Error(`${companyId} cannot march on from ${source.def.title}.`);
    if (target.companies.some((company) => company.id === companyId)) {
      throw new Error(`${candidate.name} is already part of ${target.title}.`);
    }
    return candidate;
  });
}

// ---------------------------------------------------------------------------
// Authoring lint
// ---------------------------------------------------------------------------

/**
 * Authoring lint for a Roll campaign against its scenarios: profiles inside their role
 * band, arrivals that exist, every battle's authored default assignment fitting its slots
 * with companies that have arrived by then, at most MAX_FLEX_SLOTS flex slots per battle
 * with the squad's own role first and a player doctrine for every role, and locks that
 * name an arrived company of a fitting role. Every slot can always be filled (a levy
 * covers any shortfall), so no fill-proof is needed.
 */
export function lintRollCampaign(def: CampaignDefinition, scenarios: EngineScenario[]): string[] {
  const problems: string[] = [];
  for (const company of def.companies) {
    if (!company.profile) {
      problems.push(`company ${company.id} has no profile`);
    } else {
      const band = PROFILE_BANDS[company.role];
      const { strength, cohesion } = company.profile;
      if (strength < band.strength[0] || strength > band.strength[1] || cohesion < band.cohesion[0] || cohesion > band.cohesion[1]) {
        problems.push(`company ${company.id}: profile ${strength}/${cohesion} is outside the ${company.role} band ${band.strength.join("-")}/${band.cohesion.join("-")}`);
      }
    }
    if (company.joins !== undefined && !def.battles.some((battle) => battle.id === company.joins)) {
      problems.push(`company ${company.id} joins at unknown battle ${company.joins}`);
    }
  }
  def.battles.forEach((battle, index) => {
    const at = (problem: string) => problems.push(`${battle.id}: ${problem}`);
    const arrived = (companyId: string) => {
      const company = def.companies.find((item) => item.id === companyId);
      return company && battleIndexOf(def, company.joins) <= index ? company : undefined;
    };
    for (const companyId of Object.values(battle.slots)) {
      if (!def.companies.some((item) => item.id === companyId)) at(`unknown company ${companyId}`);
    }
    if (battle.placeholder) return;
    const scenario = scenarios.find((item) => item.id === battle.scenarioId);
    if (!scenario) {
      at(`unknown scenario ${battle.scenarioId}`);
      return;
    }
    const slots = slotsOf(battle, scenario);
    const flex = Object.entries(battle.call?.flex ?? {});
    if (flex.length > MAX_FLEX_SLOTS) at(`has ${flex.length} flex slots (at most ${MAX_FLEX_SLOTS})`);
    for (const [slotId, rule] of flex) {
      const squad = slotSquads(scenario).find((item) => item.id === slotId);
      if (!squad) {
        at(`flex slot ${slotId} is not a player squad`);
        continue;
      }
      if (rule.roles[0] !== squad.role) at(`flex slot ${slotId} must list its own role (${squad.role}) first`);
      if (new Set(rule.roles).size !== rule.roles.length) at(`flex slot ${slotId} lists a role twice`);
      for (const role of rule.roles) {
        const doctrineId = rule.doctrines[role];
        if (!doctrineId) at(`flex slot ${slotId} has no doctrine for ${role}`);
        else if (!scenario.playerDoctrineIds.includes(doctrineId)) at(`flex slot ${slotId}: ${doctrineId} is not a player doctrine here`);
      }
    }
    const used = new Set<string>();
    for (const slot of slots) {
      const companyId = battle.slots[slot.slotId];
      if (!companyId) {
        at(`slot ${slot.slotId} has no authored company`);
        continue;
      }
      if (used.has(companyId)) at(`${companyId} fills two slots`);
      used.add(companyId);
      const company = arrived(companyId);
      if (!company) at(`${companyId} has not joined the Roll by this battle`);
      else if (!slot.roles.includes(company.role)) at(`${companyId} (${company.role}) cannot fill ${slot.slotId}`);
    }
    for (const slotId of Object.keys(battle.slots)) {
      if (!slots.some((slot) => slot.slotId === slotId)) at(`no player squad ${slotId}`);
    }
    for (const [slotId, companyId] of Object.entries(battle.call?.locked ?? {})) {
      const slot = slots.find((item) => item.slotId === slotId);
      const company = arrived(companyId);
      if (!slot) at(`locked slot ${slotId} is not a player squad`);
      else if (!company) at(`locked company ${companyId} has not joined the Roll by this battle`);
      else if (!slot.roles.includes(company.role)) at(`locked company ${companyId} (${company.role}) cannot fill ${slotId}`);
    }
    const lockedIds = Object.values(battle.call?.locked ?? {});
    if (new Set(lockedIds).size !== lockedIds.length) at("locks one company into two slots");
  });
  return problems;
}
