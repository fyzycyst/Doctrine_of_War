// A stand-in for the engine's Roll (M1 P2) and per-campaign saves (P3), following the
// contract's documented rules, so the Roll UI can be built, tested and captured before the
// engine's implementations land. Dev (`?mockRoll=1`) and tests only. It is deliberately
// simple: the engine's own functions are the authority, and replace this through the seam.
import {
  currentBattle,
  LEVY_ID,
  LEVY_PROFILE,
  LEVY_RESOLVE,
  REFORMED_RESOLVE,
  WORN_BELOW,
  WORN_PENALTY,
  CARRY_OVER_MAX,
  CARRY_RESOLVE,
  type Assignment,
  type CampaignCompany,
  type CampaignDefinition,
  type CampaignSaveRead,
  type CampaignState,
  type CarriedCompany,
  type CompanyResult,
  type RollEntry,
  type RollSlot,
} from "../../game/campaign";
import { fameOf, hostEscalation } from "../../game/campaign/campaign";
import { RESOLVE_MAX, RESOLVE_MIN } from "../../game/campaign/types";
import type { EngineScenario, SquadRole } from "../../game/engine";
import type { PackRegistry } from "../../game/packs";
import type { RollApi, RunStore } from "./api";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function newcomer(def: CampaignDefinition, id: string): CampaignCompany | undefined {
  const company = def.companies.find((item) => item.id === id);
  if (!company) return undefined;
  return {
    id: company.id,
    name: company.name,
    role: company.role,
    resolve: company.startingResolve ?? 0,
    renown: null,
    battlesFought: 0,
    casualties: { routed: 0, destroyed: 0 },
    reformed: 0,
    condition: "fresh",
    profile: company.profile,
  };
}

/** Everyone on the Roll: the companies that have fought, then arrivals so far, then the carried. */
function companiesOn(def: CampaignDefinition, state: CampaignState): CampaignCompany[] {
  const list = state.companies.map((company) => structuredClone(company));
  const reached = state.battleIndex;
  for (const company of def.companies) {
    const joinsAt = company.joins ? def.battles.findIndex((battle) => battle.id === company.joins) : 0;
    if (joinsAt <= reached && !list.some((item) => item.id === company.id)) list.push(newcomer(def, company.id)!);
  }
  for (const carried of state.carried ?? []) {
    if (list.some((item) => item.id === carried.id)) continue;
    list.push({
      id: carried.id,
      name: carried.name,
      role: carried.role,
      resolve: carried.resolve,
      renown: carried.renown,
      battlesFought: 0,
      casualties: { routed: 0, destroyed: 0 },
      reformed: 0,
      condition: "fresh",
      profile: carried.profile,
      carriedFrom: carried.from,
    });
  }
  return list;
}

const fieldedProfile = (company: CampaignCompany) => {
  const profile = company.profile ?? { strength: 70, cohesion: 70 };
  return company.condition === "worn" ? { strength: profile.strength - WORN_PENALTY.strength, cohesion: profile.cohesion - WORN_PENALTY.cohesion } : profile;
};

const rollFor: RollApi["rollFor"] = (def, state) =>
  companiesOn(def, state).map((company) => {
    const condition = company.condition ?? "fresh";
    return {
      company,
      condition,
      available: condition !== "reforming",
      unavailableReason: condition === "reforming" ? "Reforming: sits out this battle." : null,
      fielded: fieldedProfile(company),
    } satisfies RollEntry;
  });

const playerSquads = (scenario: EngineScenario) => scenario.squads.filter((squad) => squad.faction === scenario.playerFaction && !squad.noncombatant);

const rollSlots: RollApi["rollSlots"] = (def, state, scenario) => {
  const battle = currentBattle(def, state)!;
  return playerSquads(scenario).map((squad) => {
    const flex = battle.call?.flex?.[squad.id];
    return {
      slotId: squad.id,
      label: squad.name,
      roles: flex?.roles ?? [squad.role],
      flex: Boolean(flex),
      locked: battle.call?.locked?.[squad.id] ?? null,
      doctrines: flex?.doctrines ?? { [squad.role]: squad.doctrineId },
    } satisfies RollSlot;
  });
};

const readiness = (entry: RollEntry) => (entry.condition === "fresh" ? 0 : 1);

const recommendedForce: RollApi["recommendedForce"] = (def, state, scenario) => {
  const battle = currentBattle(def, state)!;
  const entries = rollFor(def, state);
  const used = new Set<string>();
  const assignment: Assignment = {};
  for (const slot of rollSlots(def, state, scenario)) {
    const authored = entries.find((entry) => entry.company.id === (slot.locked ?? battle.slots[slot.slotId]));
    const pick =
      (slot.locked && authored) ||
      (authored && authored.available && authored.condition === "fresh" && !used.has(authored.company.id) && slot.roles.includes(authored.company.role) ? authored : undefined) ||
      entries
        .filter((entry) => entry.available && !used.has(entry.company.id) && slot.roles.includes(entry.company.role))
        .sort((a, b) => readiness(a) - readiness(b) || b.company.resolve - a.company.resolve)[0];
    assignment[slot.slotId] = pick ? pick.company.id : LEVY_ID;
    if (pick) used.add(pick.company.id);
  }
  return assignment;
};

const validateAssignment: RollApi["validateAssignment"] = (def, state, scenario, assignment) => {
  const problems: Record<string, string> = {};
  const entries = rollFor(def, state);
  const slots = rollSlots(def, state, scenario);
  const seen = new Map<string, string>();
  for (const slot of slots) {
    const id = assignment[slot.slotId];
    if (!id) {
      problems[slot.slotId] = `${slot.label}: no company called to this post.`;
      continue;
    }
    if (slot.locked && id !== slot.locked) {
      problems[slot.slotId] = `${slot.label} is held for ${entries.find((entry) => entry.company.id === slot.locked)?.company.name ?? slot.locked}.`;
      continue;
    }
    if (id === LEVY_ID) {
      const spare = entries.find((entry) => entry.available && slot.roles.includes(entry.company.role) && !Object.values(assignment).includes(entry.company.id));
      if (spare) problems[slot.slotId] = `${slot.label}: ${spare.company.name} is ready; a levy only fills a post no company can.`;
      continue;
    }
    const entry = entries.find((item) => item.company.id === id);
    if (!entry) problems[slot.slotId] = `${slot.label}: that company is not on the Roll.`;
    else if (!entry.available && slot.locked !== id) problems[slot.slotId] = `${entry.company.name}: ${entry.unavailableReason}`;
    else if (!slot.roles.includes(entry.company.role)) problems[slot.slotId] = `${slot.label} needs ${slot.roles.join(" or ")}; ${entry.company.name} is ${entry.company.role}.`;
    else if (seen.has(id)) problems[slot.slotId] = `${entry.company.name} is already called to ${seen.get(id)}.`;
    if (entry) seen.set(id, slot.label);
  }
  return problems;
};

const battleThreat: RollApi["battleThreat"] = (def, state, scenario) => {
  const recommended = recommendedForce(def, state, scenario);
  const entries = rollFor(def, state);
  const fielded = Object.values(recommended)
    .map((id) => entries.find((entry) => entry.company.id === id)?.company)
    .filter((company): company is CampaignCompany => Boolean(company));
  return hostEscalation(fielded, fameOf(playerSquads(scenario)));
};

const assembleBattle: RollApi["assembleBattle"] = (def, state, scenario, assignment) => {
  const problems = validateAssignment(def, state, scenario, assignment);
  if (Object.keys(problems).length) throw new Error(Object.values(problems)[0]);
  const entries = rollFor(def, state);
  const slots = rollSlots(def, state, scenario);
  const threat = battleThreat(def, state, scenario);
  return {
    ...scenario,
    squads: scenario.squads.map((squad) => {
      if (squad.faction !== scenario.playerFaction) {
        return {
          ...squad,
          strength: clamp(squad.strength + threat.strength, 10, 100),
          resolve: clamp(squad.resolve + threat.resolve, RESOLVE_MIN, RESOLVE_MAX),
        };
      }
      const slot = slots.find((item) => item.slotId === squad.id);
      if (!slot) return { ...squad };
      const { renown: _authored, ...rest } = squad;
      const id = assignment[squad.id];
      if (id === LEVY_ID) {
        const role = slot.roles[0];
        return { ...rest, name: "Levy", role, ...LEVY_PROFILE[role], resolve: LEVY_RESOLVE, doctrineId: slot.doctrines[role] ?? squad.doctrineId };
      }
      const company = entries.find((entry) => entry.company.id === id)!;
      const role: SquadRole = company.company.role;
      return {
        ...rest,
        name: company.company.name,
        role,
        strength: company.fielded.strength,
        cohesion: company.fielded.cohesion,
        resolve: company.company.resolve,
        doctrineId: slot.doctrines[role] ?? squad.doctrineId,
        ...(company.company.renown ? { renown: { ...company.company.renown } } : {}),
      };
    }),
  };
};

const recordBattle: RollApi["recordBattle"] = (def, state, final, options = {}) => {
  const assignment = options.assignment ?? {};
  const battle = currentBattle(def, state)!;
  const outcome = final.status as "victory" | "defeat" | "stalemate";
  const roster = companiesOn(def, state);
  const results: CompanyResult[] = [];
  const advancing = outcome !== "defeat";
  for (const [slotId, companyId] of Object.entries(assignment)) {
    const squad = final.squads.find((item) => item.id === slotId);
    const company = roster.find((item) => item.id === companyId);
    if (!squad || !company) continue;
    const before = company.resolve;
    const start = fieldedProfile(company).strength;
    company.battlesFought += 1;
    if (squad.status === "destroyed") {
      company.casualties.destroyed += 1;
      company.resolve = REFORMED_RESOLVE;
      company.renown = null;
    } else if (squad.status === "routed") {
      company.casualties.routed += 1;
      company.resolve = clamp(company.resolve - 1, RESOLVE_MIN, RESOLVE_MAX);
    } else if (outcome === "victory") {
      company.resolve = clamp(company.resolve + 1, RESOLVE_MIN, RESOLVE_MAX);
    }
    if (advancing) {
      company.condition =
        squad.status === "destroyed" ? "reforming" : squad.status === "routed" || squad.strength < WORN_BELOW * start ? "worn" : company.condition;
    }
    results.push({ companyId, squadId: slotId, ended: squad.status, resolveBefore: before, resolveAfter: company.resolve, renownEarned: null, startStrength: start, endStrength: squad.status === "destroyed" ? 0 : squad.strength });
  }
  if (advancing) {
    // In reserve: rest clears Worn and Reforming.
    for (const company of roster) if (!Object.values(assignment).includes(company.id)) company.condition = "fresh";
  }
  const battleIndex = advancing ? state.battleIndex + 1 : state.battleIndex;
  return {
    ...state,
    battleIndex,
    status: battleIndex >= def.battles.length ? "complete" : "inProgress",
    companies: roster,
    history: [
      ...state.history,
      {
        battleId: battle.id,
        scenarioId: battle.scenarioId,
        attempt: state.history.filter((record) => record.battleId === battle.id).length + 1,
        outcome,
        seed: final.seed,
        phasesPlayed: final.phase,
        companiesBroken: results.filter((result) => result.ended === "routed" || result.ended === "destroyed").length,
        enemyBroken: final.squads.filter((squad) => !Object.hasOwn(assignment, squad.id) && !squad.noncombatant && (squad.status === "routed" || squad.status === "destroyed") && final.squads.find((item) => Object.hasOwn(assignment, item.id))?.faction !== squad.faction).length,
        objectiveIntegrity: null,
        companies: results,
        assignment: { ...assignment },
      },
    ],
  };
};

const carryOverCandidates: RollApi["carryOverCandidates"] = (_def, state, packId) =>
  state.status !== "complete"
    ? []
    : state.companies.map(
        (company) =>
          ({
            id: company.id,
            name: company.name,
            role: company.role,
            profile: company.profile ?? { strength: 70, cohesion: 70 },
            resolve: clamp(company.resolve, CARRY_RESOLVE.min, CARRY_RESOLVE.max),
            renown: company.renown,
            from: { packId, campaignId: state.campaignId },
          }) satisfies CarriedCompany,
      );

const snapshotCarryOver: RollApi["snapshotCarryOver"] = (source, target, ids) => {
  if (ids.length > CARRY_OVER_MAX) throw new Error(`Bring at most ${CARRY_OVER_MAX} companies.`);
  const candidates = carryOverCandidates(source.def, source.state, source.packId);
  return ids.map((id) => {
    const found = candidates.find((item) => item.id === id);
    if (!found) throw new Error(`${id} cannot be carried over.`);
    if (target.companies.some((company) => company.id === id)) throw new Error(`${found.name} already serves in ${target.title}.`);
    return found;
  });
};

export const fakeRoll: RollApi = {
  rollFor,
  rollSlots,
  recommendedForce,
  validateAssignment,
  battleThreat,
  assembleBattle,
  recordBattle,
  carryOverCandidates,
  snapshotCarryOver,
};

/** In-memory runs: `seed` may pre-set what a campaign's read finds (e.g. an unavailable run). */
export function memoryRuns(registry: PackRegistry, seed: Record<string, CampaignSaveRead> = {}): RunStore & { reads: Record<string, CampaignSaveRead> } {
  const reads: Record<string, CampaignSaveRead> = { ...seed };
  return {
    reads,
    async load(campaignId) {
      return structuredClone(reads[campaignId] ?? { kind: "empty" });
    },
    async save(state) {
      const there = reads[state.campaignId];
      if (there && there.kind !== "ok" && there.kind !== "empty") throw new Error("A saved run this build cannot continue is kept; it was not overwritten.");
      const found = registry.campaign(state.campaignId);
      reads[state.campaignId] = {
        kind: "ok",
        state: structuredClone(state),
        provenance: { packId: found?.pack.id ?? "unknown", campaignId: state.campaignId, contentRevision: 1, rulesRevision: 1 },
      };
    },
  };
}
