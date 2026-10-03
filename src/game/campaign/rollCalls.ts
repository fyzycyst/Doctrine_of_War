// The Tier A named calls for Roll campaigns (M1, P5; synthesis §6). Each Roll battle is
// balanced on deterministic assignments from deterministic campaign states:
//
//   recommended    recommendedForce on the curated path (the one-action default)     full guardrails
//   curated        the battle's authored call (battle.slots) on the curated path      full guardrails
//   rough          a battered Roll (best company Reforming, next two Worn at -1);     floor
//                  its recommended force is the recovery force
//   greedy         highest-fame legal pick per post (veteran-heavy, ignores Worn)      floor
//   weakest        lowest-fame legal pick per post (levies only where forced)         diagnostic; its
//                  recovery force is the recommended call on the same state, which is gated in full
//   role:<pattern> one per combination of flex-post roles (the readiest company of     floor
//                  that role), when it can be filled legally; reference plans are played
//                  exactly as authored (the role template only fills unset flex posts)
//   carried:*      the same, at campaign start with CARRY_OVER_MAX intro veterans      full guardrails
//                  carried in (Q3; at most carriedFieldedLimit() fielded): recommended, greedy
//
// "Plan beats roster" and the selection spread are reported as diagnostics (rollDiagnostics).
import { playBattle, type BalanceRow, type GuardrailPolicy } from "../engine/balance";
import type { EngineScenario, Orders, SquadRole } from "../engine/types";
import { REFORMED_RESOLVE, fameOf, recordBattle, startCampaign } from "./campaign";
import { assembleBattle, battleThreat, CARRY_OVER_MAX, carriedFieldedLimit, carryOverCandidates, recommendedForce, rollRoster, rollSlots, validateAssignment, type RollSlot } from "./roll";
import { LEVY_ID, type Assignment, type CampaignCompany, type CampaignDefinition, type CampaignState, type CarriedCompany } from "./types";

export type RollCallKind = "recommended" | "curated" | "rough" | "greedy" | "weakest" | "role" | "carried-recommended" | "carried-greedy";

export interface RollCall {
  kind: RollCallKind;
  /** Display name, e.g. "role: outriders=frontline". */
  name: string;
  /** "diagnostic": reported, never gated (weakest-legal; its recovery force is gated instead). */
  policy: GuardrailPolicy | "diagnostic";
  /** The battle as this call fights it (assembled; reference plans follow flex templates). */
  scenario: EngineScenario;
  state: CampaignState;
  assignment: Assignment;
  /** Who takes the field, for reports. */
  roster: string;
}

function scenarioFor(scenarios: EngineScenario[], id: string): EngineScenario {
  const scenario = scenarios.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown scenario ${id}`);
  return scenario;
}

/**
 * The Roll at the start of battle `index` along the curated path: every earlier battle
 * fought by its recommended force on its intended plan and curated seed.
 */
export function curatedRollState(def: CampaignDefinition, scenarios: EngineScenario[], index: number, carryOver: CarriedCompany[] = []): CampaignState {
  let state = startCampaign(def, { carryOver });
  for (let battleIndex = 0; battleIndex < index; battleIndex += 1) {
    const battle = def.battles[battleIndex];
    const scenario = scenarioFor(scenarios, battle.scenarioId);
    if (battle.placeholder || !scenario.referencePlans || scenario.curatedSeed === undefined) {
      throw new Error(`Battle ${battle.id} cannot be replayed on the curated path`);
    }
    const assignment = recommendedForce(def, state, scenario);
    const fought = assembleBattle(def, state, scenario, assignment);
    const final = playBattle(fought, templatePlan(fought.referencePlans!.intended, def, state, scenario, assignment), scenario.curatedSeed, "on");
    state = recordBattle(def, state, final, { assignment });
    if (state.battleIndex !== battleIndex + 1) throw new Error(`Curated seed for ${battle.id} does not advance the campaign (${final.status})`);
  }
  return state;
}

/**
 * A battered Roll derived from a curated state: the readiest company destroyed (Reforming,
 * Resolve REFORMED_RESOLVE, renown lost), the next two routed (Worn, Resolve -1). It is a
 * hypothetical before the first battle (nothing can be battered yet), kept so every
 * battle is floored on the same shape.
 */
export function roughRollState(def: CampaignDefinition, state: CampaignState): CampaignState {
  const roster = rollRoster(def, state);
  const ranked = [...roster].sort((a, b) => fameOf([b]) - fameOf([a]) || (b.profile?.strength ?? 0) - (a.profile?.strength ?? 0) || roster.indexOf(a) - roster.indexOf(b));
  const companies = roster.map((company) => {
    const rank = ranked.indexOf(company);
    if (rank === 0) return { ...company, resolve: REFORMED_RESOLVE, renown: null, reformed: company.reformed + 1, condition: "reforming" as const };
    if (rank <= 2) return { ...company, resolve: -1, condition: "worn" as const };
    return company;
  });
  // The roster now holds every arrival and carried company explicitly.
  return { ...structuredClone(state), companies };
}

/** The intro veterans a strong player carries into a Roll campaign: the CARRY_OVER_MAX most famous. */
export function strongCarryOver(source: { def: CampaignDefinition; state: CampaignState; packId: string }): CarriedCompany[] {
  const candidates = carryOverCandidates(source.def, source.state, source.packId);
  return [...candidates]
    .sort((a, b) => fameOf([b]) - fameOf([a]) || b.profile.strength - a.profile.strength || candidates.indexOf(a) - candidates.indexOf(b))
    .slice(0, CARRY_OVER_MAX);
}

/**
 * A legal force picked by `score` (higher first; ties by Roll order): single-role posts
 * first, then flex posts (each restricted to `roles[slotId]` when given), story locks
 * honoured, at most carriedFieldedLimit() carried veterans fielded, a levy only where no
 * company can hold the post. Null when `roles` forces a
 * levy onto a flex post another company could hold (an illegal pattern).
 */
export function pickForce(
  def: CampaignDefinition,
  state: CampaignState,
  scenario: EngineScenario,
  score: (company: CampaignCompany) => number,
  roles: Record<string, SquadRole> = {},
): Assignment | null {
  const roster = rollRoster(def, state);
  const slots = rollSlots(def, state, scenario);
  const used = new Set<string>();
  const assignment: Assignment = {};
  for (const slot of slots) {
    if (slot.locked) {
      assignment[slot.slotId] = slot.locked;
      used.add(slot.locked);
    }
  }
  const fits = (company: CampaignCompany, slot: RollSlot) =>
    (roles[slot.slotId] ? company.role === roles[slot.slotId] : slot.roles.includes(company.role)) && company.condition !== "reforming";
  // Carried veterans: at most the campaign's limit take the field (any locked ones count).
  const limit = carriedFieldedLimit(def);
  let veterans = Object.values(assignment).filter((companyId) => roster.find((company) => company.id === companyId)?.carriedFrom).length;
  for (const slot of [...slots.filter((item) => !item.flex), ...slots.filter((item) => item.flex)]) {
    if (assignment[slot.slotId]) continue;
    const best = roster
      .map((company, index) => ({ company, index }))
      .filter(({ company }) => !used.has(company.id) && fits(company, slot) && !(company.carriedFrom && veterans >= limit))
      .sort((a, b) => score(b.company) - score(a.company) || a.index - b.index)[0];
    assignment[slot.slotId] = best ? best.company.id : LEVY_ID;
    if (best) used.add(best.company.id);
    if (best?.company.carriedFrom) veterans += 1;
  }
  const ordered = Object.fromEntries(slots.map((slot) => [slot.slotId, assignment[slot.slotId]]));
  return Object.keys(validateAssignment(def, state, scenario, ordered)).length === 0 ? ordered : null;
}

const fame = (company: CampaignCompany) => fameOf([company]);
const strength = (company: CampaignCompany) => company.profile?.strength ?? 0;

/** Highest fame first (veterans and renown), then the strongest profile. Ignores Worn. */
export const greedyScore = (company: CampaignCompany) => fame(company) * 1000 + strength(company);
/** Lowest fame first, then the weakest profile; Worn companies count as weakest. */
export const weakestScore = (company: CampaignCompany) => -(fame(company) * 1000 + strength(company)) + (company.condition === "worn" ? 500 : 0);

/**
 * The plan an assignment plays. A reference plan is played EXACTLY as authored: every
 * order it sets stands, whoever fills the post (doctrines are not tied to roles). The
 * call's role template (`flex.doctrines`) only fills a flex post the plan leaves unset.
 */
export function templatePlan(plan: Orders, def: CampaignDefinition, state: CampaignState, scenario: EngineScenario, assignment: Assignment): Orders {
  const roster = rollRoster(def, state);
  const filled: Orders = { ...plan };
  for (const slot of rollSlots(def, state, scenario)) {
    if (Object.hasOwn(plan, slot.slotId) || !slot.flex) continue;
    const companyId = assignment[slot.slotId];
    const role = companyId === LEVY_ID ? slot.roles[0] : roster.find((company) => company.id === companyId)?.role;
    const doctrineId = role ? slot.doctrines[role] : undefined;
    if (doctrineId) filled[slot.slotId] = doctrineId;
  }
  return filled;
}

function describe(def: CampaignDefinition, state: CampaignState, assignment: Assignment): string {
  const roster = rollRoster(def, state);
  return Object.entries(assignment)
    .map(([slotId, companyId]) => {
      const company = roster.find((item) => item.id === companyId);
      if (!company) return `${slotId}: levy`;
      const tags = [company.condition && company.condition !== "fresh" ? company.condition : "", company.renown ? `"${company.renown.title}"` : "", company.carriedFrom ? "carried" : ""].filter(Boolean);
      return `${company.name} ${company.resolve >= 0 ? "+" : ""}${company.resolve}${tags.length ? ` (${tags.join(", ")})` : ""}`;
    })
    .join(", ");
}

function call(kind: RollCallKind, name: string, policy: RollCall["policy"], def: CampaignDefinition, state: CampaignState, scenario: EngineScenario, assignment: Assignment): RollCall {
  const assembled = assembleBattle(def, state, scenario, assignment);
  const plans = scenario.referencePlans!;
  return {
    kind,
    name,
    policy,
    state,
    assignment,
    roster: describe(def, state, assignment),
    scenario: {
      ...assembled,
      referencePlans: {
        intended: templatePlan(plans.intended, def, state, scenario, assignment),
        bad: templatePlan(plans.bad, def, state, scenario, assignment),
        ...(plans.alternative ? { alternative: templatePlan(plans.alternative, def, state, scenario, assignment) } : {}),
      },
    },
  };
}

/** Every flex-role combination other than the all-own-role one (that is the recommended call). */
function rolePatterns(slots: RollSlot[]): Record<string, SquadRole>[] {
  const flex = slots.filter((slot) => slot.flex);
  let patterns: Record<string, SquadRole>[] = [{}];
  for (const slot of flex) patterns = patterns.flatMap((pattern) => slot.roles.map((role) => ({ ...pattern, [slot.slotId]: role })));
  return patterns.filter((pattern) => flex.some((slot) => pattern[slot.slotId] !== slot.roles[0]));
}

/** A documented call that cannot exist for this battle, and why (only flex-role patterns). */
export interface NotApplicableCall {
  name: string;
  reason: string;
}

export interface RollCallMatrix {
  calls: RollCall[];
  notApplicable: NotApplicableCall[];
}

/** Thrown when a mandatory named call cannot be built: the matrix never silently shrinks. */
export class MissingCallError extends Error {
  constructor(battleId: string, name: string, reason: string) {
    super(`Battle ${battleId}: the "${name}" call cannot be built (${reason})`);
    this.name = "MissingCallError";
  }
}

/** Why a flex-role pattern has no legal force, or null when the Roll's numbers allow it. */
function patternShortfall(def: CampaignDefinition, state: CampaignState, slots: RollSlot[], pattern: Record<string, SquadRole>): string | null {
  const need = new Map<SquadRole, number>();
  for (const slot of slots) {
    const role = pattern[slot.slotId] ?? slot.roles[0];
    need.set(role, (need.get(role) ?? 0) + 1);
  }
  const ready = rollRoster(def, state).filter((company) => company.condition !== "reforming");
  for (const [role, count] of need) {
    const have = ready.filter((company) => company.role === role).length;
    if (have < count) return `it needs ${count} ${role} companies and the Roll has ${have} ready`;
  }
  return null;
}

/**
 * The named calls for Roll battle `index`, as a census. Every documented call is built or
 * the matrix FAILS (MissingCallError): recommended, curated, rough, greedy, weakest legal,
 * every flex-role pattern, and (at the first battle, given `carryFrom`, a completed
 * campaign whose most famous companies a strong player carries in) carried recommended and
 * carried greedy. The only exception is a role pattern the Roll cannot legally field (too
 * few companies of a role), which is listed in `notApplicable` with its reason.
 */
export function rollCallMatrix(
  def: CampaignDefinition,
  scenarios: EngineScenario[],
  index: number,
  carryFrom?: { def: CampaignDefinition; state: CampaignState; packId: string },
): RollCallMatrix {
  const battle = def.battles[index];
  const scenario = scenarioFor(scenarios, battle.scenarioId);
  const curated = curatedRollState(def, scenarios, index);
  const required = (name: string, assignment: Assignment | null, reason: string): Assignment => {
    if (!assignment) throw new MissingCallError(battle.id, name, reason);
    return assignment;
  };
  const calls: RollCall[] = [call("recommended", "recommended", "full", def, curated, scenario, recommendedForce(def, curated, scenario))];
  const authored = Object.fromEntries(rollSlots(def, curated, scenario).map((slot) => [slot.slotId, battle.slots[slot.slotId]]));
  const authoredProblems = Object.values(validateAssignment(def, curated, scenario, authored));
  calls.push(call("curated", "curated", "full", def, curated, scenario, required("curated", authoredProblems.length === 0 ? authored : null, `the authored call is not legal: ${authoredProblems.join(" ")}`)));
  const rough = roughRollState(def, curated);
  calls.push(call("rough", "rough (recovery force)", "floor", def, rough, scenario, recommendedForce(def, rough, scenario)));
  calls.push(call("greedy", "greedy", "floor", def, curated, scenario, required("greedy", pickForce(def, curated, scenario, greedyScore), "no legal highest-fame force")));
  calls.push(call("weakest", "weakest legal", "diagnostic", def, curated, scenario, required("weakest legal", pickForce(def, curated, scenario, weakestScore), "no legal lowest-fame force")));
  const notApplicable: NotApplicableCall[] = [];
  const slots = rollSlots(def, curated, scenario);
  for (const pattern of rolePatterns(slots)) {
    const name = `role: ${Object.entries(pattern).map(([slotId, role]) => `${slotId}=${role}`).join(", ")}`;
    const assignment = pickForce(def, curated, scenario, greedyScore, pattern);
    const shortfall = assignment ? null : patternShortfall(def, curated, slots, pattern);
    if (shortfall) {
      notApplicable.push({ name, reason: `not legal: ${shortfall}` });
      continue;
    }
    calls.push(call("role", name, "floor", def, curated, scenario, required(name, assignment, "no legal force although the Roll has the companies")));
  }
  if (carryFrom && index === 0) {
    // Full guardrails: with at most carriedFieldedLimit() veterans fielded, a strong force
    // must still not win with one doctrine (the battle punishes a pure march in content).
    const carried = curatedRollState(def, scenarios, 0, strongCarryOver(carryFrom));
    calls.push(call("carried-recommended", "carried: recommended", "full", def, carried, scenario, recommendedForce(def, carried, scenario)));
    calls.push(call("carried-greedy", "carried: greedy", "full", def, carried, scenario, required("carried: greedy", pickForce(def, carried, scenario, greedyScore), "no legal highest-fame force with veterans")));
  }
  return { calls, notApplicable };
}

/** The named calls for Roll battle `index` (rollCallMatrix's calls; it fails closed). */
export function rollCalls(
  def: CampaignDefinition,
  scenarios: EngineScenario[],
  index: number,
  carryFrom?: { def: CampaignDefinition; state: CampaignState; packId: string },
): RollCall[] {
  return rollCallMatrix(def, scenarios, index, carryFrom).calls;
}

/** The Host's fixed threat for a call's state, for reports. */
export function callThreat(def: CampaignDefinition, scenarios: EngineScenario[], callItem: RollCall, index: number): string {
  const threat = battleThreat(def, callItem.state, scenarioFor(scenarios, def.battles[index].scenarioId));
  return `fame ${threat.fame >= 0 ? "+" : ""}${threat.fame}: Host strength ${threat.strength >= 0 ? "+" : ""}${threat.strength}, Resolve ${threat.resolve >= 0 ? "+" : ""}${threat.resolve}`;
}

export interface RollDiagnostics {
  /** Intended-plan advance: best call minus worst call (synthesis: <= 25 points proposed, >= 5 informational). */
  spread: number;
  best: { name: string; advance: number };
  worst: { name: string; advance: number };
  /** The bad plan on the call where it does best, against the intended plan on the worst call. */
  planBeatsRoster: boolean;
  bestBad: { name: string; advance: number };
  /**
   * The strongest known alternative plan (referencePlans.alternative), when the battle has
   * one: the call where it comes closest to the intended plan, and the intended plan's lead
   * there (negative = the alternative beats it). Null without an alternative.
   */
  alternative: { name: string; lead: number; advance: number } | null;
}

/** "Plan beats roster" and the selection spread over a battle's named calls (diagnostics, not gates). */
export function rollDiagnostics(results: { name: string; rows: BalanceRow[] }[]): RollDiagnostics {
  const advance = (rows: BalanceRow[], kind: "intended" | "bad" | "alternative") => {
    const row = rows.find((item) => item.kind === kind);
    return row ? row.winRate + row.stalemateRate : Number.NaN;
  };
  const intended = results.map(({ name, rows }) => ({ name, advance: advance(rows, "intended") }));
  const bad = results.map(({ name, rows }) => ({ name, advance: advance(rows, "bad") }));
  const best = intended.reduce((a, b) => (b.advance > a.advance ? b : a));
  const worst = intended.reduce((a, b) => (b.advance < a.advance ? b : a));
  const bestBad = bad.reduce((a, b) => (b.advance > a.advance ? b : a));
  const leads = results
    .filter(({ rows }) => rows.some((row) => row.kind === "alternative"))
    .map(({ name, rows }) => ({ name, lead: advance(rows, "intended") - advance(rows, "alternative"), advance: advance(rows, "alternative") }));
  const alternative = leads.length > 0 ? leads.reduce((a, b) => (b.lead < a.lead ? b : a)) : null;
  return { spread: best.advance - worst.advance, best, worst, planBeatsRoster: bestBad.advance < worst.advance, bestBad, alternative };
}
