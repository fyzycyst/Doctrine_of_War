// The campaign state machine. Pure functions: every call returns a new state.
//
// Flow per battle:
//   battle = currentBattle(def, state)
//   scenario = applyCampaign(def, state, scenarios[battle.scenarioId])   // Resolve + renown injected
//   ... play the scenario with the engine until it ends ...
//   state = recordBattle(def, state, finalEngineState)
//
// Resolve rules after a battle (per company that fought):
//   victory or stalemate (the campaign advances):
//     ended steady (still on the field, or escaped)  +1 (stalemate: +0)
//     routed                                          -1  (stalemate: -2, the stalemate penalty)
//     destroyed                                       reforms at REFORMED_RESOLVE and loses its renown
//   defeat: the battle is retried with the same roster; Resolve does not change
//     (no death spirals). Casualties and battles fought are still counted.
// Resolve is clamped to -3..+3. Reaching +3 without a title earns a renown title,
// which is kept until the company is destroyed.
import type { EngineScenario, EngineState } from "../engine/types";
import { renownTitle } from "./titles";
import {
  RESOLVE_MAX,
  RESOLVE_MIN,
  type BattleRecord,
  type CampaignBattle,
  type CampaignCompany,
  type CampaignDefinition,
  type CampaignState,
  type CompanyResult,
} from "./types";

export const REFORMED_RESOLVE = -2;

// "The Host has heard of you": the Host scales to the army that takes the field,
// relative to the roster the scenario was authored and balanced for, in both
// directions. Fame is the sum of the fielded companies' Resolve plus RENOWN_FAME per
// renowned company. Each point of fame above (below) the authored roster's adds
// (removes) HOST_STRENGTH_PER_FAME strength on every Host company, capped at
// HOST_STRENGTH_CAP either way; every FAME_PER_HOST_RESOLVE points shift Host Resolve
// by one, capped at HOST_RESOLVE_CAP. A battered army faces a Host that holds its
// best back; a famous one draws the Host's hardest companies.
export const RENOWN_FAME = 2;
export const HOST_STRENGTH_PER_FAME = 2;
export const HOST_STRENGTH_CAP = 12;
export const FAME_PER_HOST_RESOLVE = 4;
export const HOST_RESOLVE_CAP = 1;

export interface HostEscalation {
  /** Campaign fame minus the scenario's authored fame. */
  fame: number;
  strength: number;
  resolve: number;
}

export function fameOf(entries: { resolve: number; renown?: { title: string } | null }[]): number {
  return entries.reduce((sum, entry) => sum + entry.resolve + (entry.renown ? RENOWN_FAME : 0), 0);
}

/** How much the Host hardens (or eases) against these companies, relative to the authored roster. */
export function hostEscalation(companies: CampaignCompany[], authoredFame: number): HostEscalation {
  const fame = fameOf(companies) - authoredFame;
  const sign = Math.sign(fame);
  const size = Math.abs(fame);
  return {
    fame,
    strength: sign * Math.min(HOST_STRENGTH_CAP, HOST_STRENGTH_PER_FAME * size) || 0,
    resolve: sign * Math.min(HOST_RESOLVE_CAP, Math.floor(size / FAME_PER_HOST_RESOLVE)) || 0,
  };
}

export const STALEMATE_ROUT_PENALTY = 1;

const clampResolve = (value: number) => Math.max(RESOLVE_MIN, Math.min(RESOLVE_MAX, value));

export function startCampaign(def: CampaignDefinition): CampaignState {
  return { campaignId: def.id, battleIndex: 0, status: "inProgress", companies: [], history: [] };
}

/** The battle to play next, or null when the campaign is complete. */
export function currentBattle(def: CampaignDefinition, state: CampaignState): CampaignBattle | null {
  return state.status === "complete" ? null : (def.battles[state.battleIndex] ?? null);
}

/** Companies already in the roster, plus any this battle brings in fresh. */
export function rosterFor(def: CampaignDefinition, state: CampaignState, battle: CampaignBattle): CampaignCompany[] {
  const roster = state.companies.map((company) => structuredClone(company));
  for (const companyId of Object.values(battle.slots)) {
    if (roster.some((company) => company.id === companyId)) {
      continue;
    }
    const definition = def.companies.find((company) => company.id === companyId);
    if (!definition) {
      throw new Error(`Campaign ${def.id}: unknown company ${companyId}`);
    }
    roster.push({
      id: definition.id,
      name: definition.name,
      role: definition.role,
      resolve: clampResolve(definition.startingResolve ?? 0),
      renown: null,
      battlesFought: 0,
      casualties: { routed: 0, destroyed: 0 },
      reformed: 0,
    });
  }
  return roster;
}

function playableBattle(def: CampaignDefinition, state: CampaignState, scenarioId: string): CampaignBattle {
  const battle = currentBattle(def, state);
  if (!battle) {
    throw new Error(`Campaign ${def.id} is complete`);
  }
  if (battle.placeholder) {
    throw new Error(`Battle ${battle.id} (${battle.title}) is not playable yet`);
  }
  if (battle.scenarioId !== scenarioId) {
    throw new Error(`Battle ${battle.id} is ${battle.scenarioId}, not ${scenarioId}`);
  }
  return battle;
}

/**
 * The scenario as this campaign fights it: each mapped player squad takes its
 * company's name, Resolve and renown, and the Host hardens by hostEscalation().
 * Pure; the input scenario is not modified.
 */
export function applyCampaign(def: CampaignDefinition, state: CampaignState, scenario: EngineScenario): EngineScenario {
  const battle = playableBattle(def, state, scenario.id);
  const roster = rosterFor(def, state, battle);
  const fielded = roster.filter((company) => Object.values(battle.slots).includes(company.id));
  const authored = scenario.squads.filter((squad) => Object.hasOwn(battle.slots, squad.id));
  const escalation = hostEscalation(fielded, fameOf(authored));
  return {
    ...scenario,
    squads: scenario.squads.map((squad) => {
      if (squad.faction !== scenario.playerFaction) {
        return {
          ...squad,
          strength: Math.max(10, Math.min(100, squad.strength + escalation.strength)),
          resolve: Math.max(RESOLVE_MIN, Math.min(RESOLVE_MAX, squad.resolve + escalation.resolve)),
        };
      }
      const companyId = battle.slots[squad.id];
      const company = companyId ? roster.find((item) => item.id === companyId) : undefined;
      if (!company) {
        return { ...squad };
      }
      const { renown: _authored, ...rest } = squad;
      return {
        ...rest,
        name: company.name,
        resolve: company.resolve,
        ...(company.renown ? { renown: { title: company.renown.title } } : {}),
      };
    }),
  };
}

function nextResolve(resolve: number, ended: CompanyResult["ended"], outcome: "victory" | "stalemate"): number {
  switch (ended) {
    case "active":
    case "escaped":
      // A stalemate earns nobody anything.
      return clampResolve(resolve + (outcome === "victory" ? 1 : 0));
    case "routed":
      return clampResolve(resolve - 1 - (outcome === "stalemate" ? STALEMATE_ROUT_PENALTY : 0));
    case "destroyed":
      return REFORMED_RESOLVE;
  }
}

/** Records a finished battle and returns the new campaign state (advance, or retry after a defeat). */
export function recordBattle(def: CampaignDefinition, state: CampaignState, final: EngineState): CampaignState {
  const battle = playableBattle(def, state, final.scenarioId);
  if (final.status === "command") {
    throw new Error(`Battle ${battle.id} is not over yet`);
  }
  const outcome = final.status;
  const roster = rosterFor(def, state, battle);
  const results: CompanyResult[] = [];

  for (const [squadId, companyId] of Object.entries(battle.slots)) {
    const squad = final.squads.find((item) => item.id === squadId);
    const company = roster.find((item) => item.id === companyId);
    if (!squad || !company) {
      throw new Error(`Battle ${battle.id}: squad ${squadId} or company ${companyId} is missing`);
    }
    const before = company.resolve;
    let renownEarned: string | null = null;
    company.battlesFought += 1;
    if (squad.status === "routed") company.casualties.routed += 1;
    if (squad.status === "destroyed") company.casualties.destroyed += 1;

    if (outcome !== "defeat") {
      company.resolve = nextResolve(company.resolve, squad.status, outcome);
      if (squad.status === "destroyed") {
        company.renown = null;
        company.reformed += 1;
      } else if (company.resolve === RESOLVE_MAX && !company.renown) {
        const taken = roster.flatMap((item) => (item.renown ? [item.renown.title] : []));
        company.renown = { title: renownTitle(company.id, taken) };
        renownEarned = company.renown.title;
      }
    }
    results.push({ companyId, squadId, ended: squad.status, resolveBefore: before, resolveAfter: company.resolve, renownEarned });
  }

  const player = final.squads.filter((squad) => Object.hasOwn(battle.slots, squad.id));
  const enemies = final.squads.filter((squad) => !player.includes(squad) && player.every((p) => p.faction !== squad.faction));
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
    companies: results,
  };

  const battleIndex = outcome === "defeat" ? state.battleIndex : state.battleIndex + 1;
  return {
    campaignId: state.campaignId,
    battleIndex,
    status: battleIndex >= def.battles.length ? "complete" : "inProgress",
    companies: roster,
    history: [...state.history, record],
  };
}

/**
 * Checks authored campaign data against the scenarios it refers to. Returns a list of
 * problems (empty when valid). Placeholder battles are only checked for existence of
 * their slot companies.
 */
export function validateCampaignDefinition(def: CampaignDefinition, scenarios: EngineScenario[]): string[] {
  const problems: string[] = [];
  const companyIds = new Set<string>();
  for (const company of def.companies) {
    if (companyIds.has(company.id)) problems.push(`duplicate company ${company.id}`);
    companyIds.add(company.id);
  }
  const battleIds = new Set<string>();
  for (const battle of def.battles) {
    if (battleIds.has(battle.id)) problems.push(`duplicate battle ${battle.id}`);
    battleIds.add(battle.id);
    const used = Object.values(battle.slots);
    if (new Set(used).size !== used.length) problems.push(`${battle.id}: a company fills two slots`);
    for (const companyId of used) {
      if (!companyIds.has(companyId)) problems.push(`${battle.id}: unknown company ${companyId}`);
    }
    if (battle.placeholder) continue;
    const scenario = scenarios.find((item) => item.id === battle.scenarioId);
    if (!scenario) {
      problems.push(`${battle.id}: unknown scenario ${battle.scenarioId}`);
      continue;
    }
    // Noncombatants (a refugee column) are not campaign companies.
    const playerSquads = scenario.squads.filter((squad) => squad.faction === scenario.playerFaction && !squad.noncombatant);
    for (const squad of playerSquads) {
      const companyId = battle.slots[squad.id];
      const company = def.companies.find((item) => item.id === companyId);
      if (!companyId) problems.push(`${battle.id}: squad ${squad.id} has no company`);
      else if (company && company.role !== squad.role) {
        problems.push(`${battle.id}: ${company.id} (${company.role}) cannot fill ${squad.id} (${squad.role})`);
      }
    }
    for (const squadId of Object.keys(battle.slots)) {
      if (!playerSquads.some((squad) => squad.id === squadId)) problems.push(`${battle.id}: no player squad ${squadId}`);
    }
  }
  return problems;
}
