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
//                  that role), when it can be filled legally; the plan follows the
//                  call's per-role doctrine template
//   carried:*      the same, at campaign start with CARRY_OVER_MAX intro veterans      floor
//                  carried in (Q3): recommended, greedy
//
// "Plan beats roster" and the selection spread are reported as diagnostics (rollDiagnostics).
import { playBattle, type BalanceRow, type GuardrailPolicy } from "../engine/balance";
import type { EngineScenario, Orders, SquadRole } from "../engine/types";
import { REFORMED_RESOLVE, fameOf, recordBattle, startCampaign } from "./campaign";
import { assembleBattle, battleThreat, CARRY_OVER_MAX, carryOverCandidates, recommendedForce, rollRoster, rollSlots, validateAssignment, type RollSlot } from "./roll";
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
 * honoured, a levy only where no company can hold the post. Null when `roles` forces a
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
  for (const slot of [...slots.filter((item) => !item.flex), ...slots.filter((item) => item.flex)]) {
    if (assignment[slot.slotId]) continue;
    const best = roster
      .map((company, index) => ({ company, index }))
      .filter(({ company }) => !used.has(company.id) && fits(company, slot))
      .sort((a, b) => score(b.company) - score(a.company) || a.index - b.index)[0];
    assignment[slot.slotId] = best ? best.company.id : LEVY_ID;
    if (best) used.add(best.company.id);
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
 * The reference plan for an assignment: each flex post takes the call's doctrine for the
 * role that fills it (the "role/slot-to-plan template"); other posts keep the plan's.
 */
export function templatePlan(plan: Orders, def: CampaignDefinition, state: CampaignState, scenario: EngineScenario, assignment: Assignment): Orders {
  const roster = rollRoster(def, state);
  const slots = rollSlots(def, state, scenario);
  return Object.fromEntries(
    Object.entries(plan).map(([slotId, doctrineId]) => {
      const slot = slots.find((item) => item.slotId === slotId);
      const companyId = assignment[slotId];
      const role = companyId === LEVY_ID ? slot?.roles[0] : roster.find((company) => company.id === companyId)?.role;
      return [slotId, slot?.flex && role ? (slot.doctrines[role] ?? doctrineId) : doctrineId];
    }),
  );
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

/**
 * The named calls for Roll battle `index`. `carryFrom` (optional) is a completed campaign
 * whose most famous companies a strong player carries in; its calls are added at the
 * first battle only (carry-over happens at campaign start).
 */
export function rollCalls(
  def: CampaignDefinition,
  scenarios: EngineScenario[],
  index: number,
  carryFrom?: { def: CampaignDefinition; state: CampaignState; packId: string },
): RollCall[] {
  const battle = def.battles[index];
  const scenario = scenarioFor(scenarios, battle.scenarioId);
  const curated = curatedRollState(def, scenarios, index);
  const calls: RollCall[] = [call("recommended", "recommended", "full", def, curated, scenario, recommendedForce(def, curated, scenario))];
  const authored = Object.fromEntries(rollSlots(def, curated, scenario).map((slot) => [slot.slotId, battle.slots[slot.slotId]]));
  if (Object.keys(validateAssignment(def, curated, scenario, authored)).length === 0) {
    calls.push(call("curated", "curated", "full", def, curated, scenario, authored));
  }
  const rough = roughRollState(def, curated);
  calls.push(call("rough", "rough (recovery force)", "floor", def, rough, scenario, recommendedForce(def, rough, scenario)));
  const greedy = pickForce(def, curated, scenario, greedyScore);
  if (greedy) calls.push(call("greedy", "greedy", "floor", def, curated, scenario, greedy));
  const weakest = pickForce(def, curated, scenario, weakestScore);
  if (weakest) calls.push(call("weakest", "weakest legal", "diagnostic", def, curated, scenario, weakest));
  for (const pattern of rolePatterns(rollSlots(def, curated, scenario))) {
    const assignment = pickForce(def, curated, scenario, greedyScore, pattern);
    const name = `role: ${Object.entries(pattern).map(([slotId, role]) => `${slotId}=${role}`).join(", ")}`;
    if (assignment) calls.push(call("role", name, "floor", def, curated, scenario, assignment));
  }
  if (carryFrom && index === 0) {
    // Floors: a fully veteran carry-over outruns the Host's capped threat, so doctrine
    // dominance is policed on the authored army (recommended, curated), as for rough.
    const carried = curatedRollState(def, scenarios, 0, strongCarryOver(carryFrom));
    calls.push(call("carried-recommended", "carried: recommended", "floor", def, carried, scenario, recommendedForce(def, carried, scenario)));
    const greedyCarried = pickForce(def, carried, scenario, greedyScore);
    if (greedyCarried) calls.push(call("carried-greedy", "carried: greedy", "floor", def, carried, scenario, greedyCarried));
  }
  return calls;
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
}

/** "Plan beats roster" and the selection spread over a battle's named calls (diagnostics, not gates). */
export function rollDiagnostics(results: { name: string; rows: BalanceRow[] }[]): RollDiagnostics {
  const advance = (rows: BalanceRow[], kind: "intended" | "bad") => {
    const row = rows.find((item) => item.kind === kind);
    return row ? row.winRate + row.stalemateRate : Number.NaN;
  };
  const intended = results.map(({ name, rows }) => ({ name, advance: advance(rows, "intended") }));
  const bad = results.map(({ name, rows }) => ({ name, advance: advance(rows, "bad") }));
  const best = intended.reduce((a, b) => (b.advance > a.advance ? b : a));
  const worst = intended.reduce((a, b) => (b.advance < a.advance ? b : a));
  const bestBad = bad.reduce((a, b) => (b.advance > a.advance ? b : a));
  return { spread: best.advance - worst.advance, best, worst, planBeatsRoster: bestBad.advance < worst.advance, bestBad };
}
