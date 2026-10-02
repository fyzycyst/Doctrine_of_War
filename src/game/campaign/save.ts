// Versioned campaign saves. Loading fails closed: anything malformed, oversized,
// from another version or inconsistent with the campaign definition is rejected
// with a CampaignSaveError, never half-loaded. The loaded state is rebuilt field by
// field from validated values, so unknown keys (and __proto__ tricks) are dropped.
import type { EngineScenario, SquadRole, SquadStatus } from "../engine/types";
import { rosterFor, settleCompany } from "./campaign";
import { CARRY_OVER_MAX, CARRY_RESOLVE, fieldedProfile, LEVY_PROFILE, PROFILE_BANDS, rollRoster, settleRollBattle, validateAssignment } from "./roll";
import {
  LEVY_ID,
  RESOLVE_MAX,
  RESOLVE_MIN,
  type Assignment,
  type BattleRecord,
  type CampaignCompany,
  type CampaignDefinition,
  type CampaignState,
  type CarriedCompany,
  type CarryOrigin,
  type CompanyCondition,
  type CompanyProfile,
  type CompanyResult,
} from "./types";

export const SAVE_VERSION = 1;
/** Hard cap on a save's size (UTF-8 bytes). Mirrored in electron/saveFile.ts. */
export const MAX_SAVE_BYTES = 256 * 1024;

const MAX_COMPANIES = 64;
const MAX_HISTORY = 500;
const ID_PATTERN = /^[a-z0-9_]{1,64}$/;
const ROLES: SquadRole[] = ["frontline", "skirmish", "support", "siege", "cavalry"];
const ENDINGS: SquadStatus[] = ["active", "routed", "destroyed", "escaped"];
const OUTCOMES = ["victory", "defeat", "stalemate"] as const;

export class CampaignSaveError extends Error {
  constructor(message: string) {
    super(`Invalid campaign save: ${message}`);
    this.name = "CampaignSaveError";
  }
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function saveCampaign(state: CampaignState): string {
  const json = JSON.stringify({ version: SAVE_VERSION, campaign: state });
  if (byteLength(json) > MAX_SAVE_BYTES) {
    throw new CampaignSaveError(`save is larger than ${MAX_SAVE_BYTES} bytes`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function fail(path: string, problem: string): never {
  throw new CampaignSaveError(`${path} ${problem}`);
}

function object(value: unknown, path: string): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object");
  return value as Json;
}

function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > max) fail(path, `has more than ${max} entries`);
  return value;
}

function text(value: unknown, path: string, max = 64): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) fail(path, `must be a string of 1..${max} characters`);
  return value;
}

function id(value: unknown, path: string): string {
  const result = text(value, path);
  if (!ID_PATTERN.test(result)) fail(path, "must be a lowercase id");
  return result;
}

function int(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    fail(path, `must be an integer in ${min}..${max}`);
  }
  // JSON allows -0; normalize it so a loaded state is identical to a played one.
  return value === 0 ? 0 : value;
}

function oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): T {
  if (typeof value !== "string" || !options.includes(value as T)) fail(path, `must be one of ${options.join(", ")}`);
  return value as T;
}

function nullableTitle(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}

const CONDITIONS: CompanyCondition[] = ["fresh", "worn", "reforming"];

function profile(value: unknown, path: string, role: SquadRole): CompanyProfile {
  const raw = object(value, path);
  const band = PROFILE_BANDS[role];
  return {
    strength: int(raw.strength, `${path}.strength`, band.strength[0], band.strength[1]),
    cohesion: int(raw.cohesion, `${path}.cohesion`, band.cohesion[0], band.cohesion[1]),
  };
}

function origin(value: unknown, path: string): CarryOrigin {
  const raw = object(value, path);
  return { packId: id(raw.packId, `${path}.packId`), campaignId: id(raw.campaignId, `${path}.campaignId`) };
}

function carriedCompany(value: unknown, path: string): CarriedCompany {
  const raw = object(value, path);
  const role = oneOf(raw.role, `${path}.role`, ROLES);
  const renown = raw.renown === null ? null : object(raw.renown, `${path}.renown`);
  return {
    id: id(raw.id, `${path}.id`),
    name: text(raw.name, `${path}.name`),
    role,
    profile: profile(raw.profile, `${path}.profile`, role),
    resolve: int(raw.resolve, `${path}.resolve`, CARRY_RESOLVE.min, CARRY_RESOLVE.max),
    renown: renown === null ? null : { title: text(renown.title, `${path}.renown.title`) },
    from: origin(raw.from, `${path}.from`),
  };
}

/** The Roll fields of a saved company (v2 saves only). */
function rollCompanyFields(raw: Json, path: string, role: SquadRole): Pick<CampaignCompany, "condition" | "profile" | "carriedFrom"> {
  return {
    condition: oneOf(raw.condition, `${path}.condition`, CONDITIONS),
    profile: profile(raw.profile, `${path}.profile`, role),
    ...(raw.carriedFrom === undefined ? {} : { carriedFrom: origin(raw.carriedFrom, `${path}.carriedFrom`) }),
  };
}

function company(value: unknown, path: string, roll = false): CampaignCompany {
  const raw = object(value, path);
  const casualties = object(raw.casualties, `${path}.casualties`);
  const renown = raw.renown === null ? null : object(raw.renown, `${path}.renown`);
  return {
    id: id(raw.id, `${path}.id`),
    name: text(raw.name, `${path}.name`),
    role: oneOf(raw.role, `${path}.role`, ROLES),
    resolve: int(raw.resolve, `${path}.resolve`, RESOLVE_MIN, RESOLVE_MAX),
    renown: renown === null ? null : { title: text(renown.title, `${path}.renown.title`) },
    battlesFought: int(raw.battlesFought, `${path}.battlesFought`, 0, 10_000),
    casualties: {
      routed: int(casualties.routed, `${path}.casualties.routed`, 0, 10_000),
      destroyed: int(casualties.destroyed, `${path}.casualties.destroyed`, 0, 10_000),
    },
    reformed: int(raw.reformed, `${path}.reformed`, 0, 10_000),
    ...(roll ? rollCompanyFields(raw, path, oneOf(raw.role, `${path}.role`, ROLES)) : {}),
  };
}

function result(value: unknown, path: string, roll = false): CompanyResult {
  const raw = object(value, path);
  const strengths = roll
    ? {
        startStrength: int(raw.startStrength, `${path}.startStrength`, 1, 100),
        endStrength: int(raw.endStrength, `${path}.endStrength`, 0, 100),
        ...(raw.levy === undefined ? {} : { levy: literalTrue(raw.levy, `${path}.levy`) }),
      }
    : {};
  return {
    companyId: id(raw.companyId, `${path}.companyId`),
    squadId: id(raw.squadId, `${path}.squadId`),
    ended: oneOf(raw.ended, `${path}.ended`, ENDINGS),
    resolveBefore: int(raw.resolveBefore, `${path}.resolveBefore`, RESOLVE_MIN, RESOLVE_MAX),
    resolveAfter: int(raw.resolveAfter, `${path}.resolveAfter`, RESOLVE_MIN, RESOLVE_MAX),
    renownEarned: nullableTitle(raw.renownEarned, `${path}.renownEarned`),
    ...strengths,
  };
}

function assignment(value: unknown, path: string): Assignment {
  const raw = object(value, path);
  const entries = Object.entries(raw);
  if (entries.length > MAX_COMPANIES) fail(path, `has more than ${MAX_COMPANIES} entries`);
  return Object.fromEntries(entries.map(([slotId, companyId]) => [id(slotId, `${path} key`), id(companyId, `${path}.${slotId}`)]));
}

function record(value: unknown, path: string, roll = false): BattleRecord {
  const raw = object(value, path);
  return {
    battleId: id(raw.battleId, `${path}.battleId`),
    scenarioId: id(raw.scenarioId, `${path}.scenarioId`),
    attempt: int(raw.attempt, `${path}.attempt`, 1, 10_000),
    outcome: oneOf(raw.outcome, `${path}.outcome`, OUTCOMES),
    seed: int(raw.seed, `${path}.seed`, 0, 0xffffffff),
    phasesPlayed: int(raw.phasesPlayed, `${path}.phasesPlayed`, 1, 100),
    companiesBroken: int(raw.companiesBroken, `${path}.companiesBroken`, 0, MAX_COMPANIES),
    enemyBroken: int(raw.enemyBroken, `${path}.enemyBroken`, 0, 1000),
    objectiveIntegrity: raw.objectiveIntegrity === null ? null : int(raw.objectiveIntegrity, `${path}.objectiveIntegrity`, 0, 100),
    companies: array(raw.companies, `${path}.companies`, MAX_COMPANIES).map((item, index) => result(item, `${path}.companies[${index}]`, roll)),
    // Optional (T16): only `true` is ever written; anything else present is refused.
    ...(raw.customOrders === undefined ? {} : { customOrders: literalTrue(raw.customOrders, `${path}.customOrders`) }),
    ...(roll ? { assignment: assignment(raw.assignment, `${path}.assignment`) } : {}),
  };
}

function literalTrue(value: unknown, path: string): true {
  if (value !== true) fail(path, "must be true when present");
  return true;
}

/**
 * Parses and validates a save. With `definition`, also checks that the save belongs to
 * that campaign and only references its battles and companies.
 */
export function loadCampaign(json: unknown, definition?: CampaignDefinition): CampaignState {
  if (typeof json !== "string") fail("save", "must be a string");
  if (byteLength(json) > MAX_SAVE_BYTES) fail("save", `is larger than ${MAX_SAVE_BYTES} bytes`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail("save", "is not valid JSON");
  }
  const envelope = object(parsed, "save");
  if (envelope.version !== SAVE_VERSION) fail("save.version", `must be ${SAVE_VERSION}`);
  const state = parseState(envelope.campaign, definition?.battles.length ?? 1000, false);
  if (definition) {
    checkAgainstDefinition(state, definition);
  }
  return state;
}

/** Rebuilds a saved campaign state from validated fields (v1 shape, or v2 with the Roll fields). */
function parseState(value: unknown, maxIndex: number, roll: boolean): CampaignState {
  const raw = object(value, "campaign");
  const state: CampaignState = {
    campaignId: id(raw.campaignId, "campaign.campaignId"),
    battleIndex: int(raw.battleIndex, "campaign.battleIndex", 0, maxIndex),
    status: oneOf(raw.status, "campaign.status", ["inProgress", "complete"] as const),
    companies: array(raw.companies, "campaign.companies", MAX_COMPANIES).map((item, index) =>
      company(item, `campaign.companies[${index}]`, roll),
    ),
    history: array(raw.history, "campaign.history", MAX_HISTORY).map((item, index) => record(item, `campaign.history[${index}]`, roll)),
    ...(roll && raw.carried !== undefined
      ? { carried: array(raw.carried, "campaign.carried", CARRY_OVER_MAX).map((item, index) => carriedCompany(item, `campaign.carried[${index}]`)) }
      : {}),
  };
  const ids = state.companies.map((item) => item.id);
  if (new Set(ids).size !== ids.length) fail("campaign.companies", "has duplicate ids");
  return state;
}

/**
 * A Roll campaign's saved state (the `campaign` of a v2 envelope), with full validation:
 * every field bounded, and the history replayed from the carried snapshot with the Roll
 * rules (assignments legal in the replayed state, start strengths as fielded, conditions,
 * Resolve and renown re-derived). Throws a CampaignSaveError naming the first problem.
 */
export function loadRollCampaignState(value: unknown, def: CampaignDefinition, scenarios: EngineScenario[]): CampaignState {
  if (def.mode !== "roll") fail("campaign", `${def.id} is not a Roll campaign`);
  const state = parseState(value, def.battles.length, true);
  checkRollHistory(state, def, scenarios);
  return state;
}

const sameProfile = (a?: CompanyProfile, b?: CompanyProfile) => a?.strength === b?.strength && a?.cohesion === b?.cohesion;

const sameCompany = (a: CampaignCompany, b: CampaignCompany) =>
  (a.condition ?? null) === (b.condition ?? null) &&
  sameProfile(a.profile, b.profile) &&
  (a.carriedFrom?.packId ?? null) === (b.carriedFrom?.packId ?? null) &&
  (a.carriedFrom?.campaignId ?? null) === (b.carriedFrom?.campaignId ?? null) &&
  a.id === b.id &&
  a.name === b.name &&
  a.role === b.role &&
  a.resolve === b.resolve &&
  (a.renown?.title ?? null) === (b.renown?.title ?? null) &&
  a.battlesFought === b.battlesFought &&
  a.casualties.routed === b.casualties.routed &&
  a.casualties.destroyed === b.casualties.destroyed &&
  a.reformed === b.reformed;

/**
 * A save must be reachable by playing this campaign: the history is replayed from a
 * fresh start with the campaign rules, and battle order, scenarios, attempts, slot
 * results, battleIndex and the whole roster (identity, role, Resolve, renown and every
 * counter) must match what that replay produces.
 */
function checkAgainstDefinition(state: CampaignState, def: CampaignDefinition): void {
  if (state.campaignId !== def.id) fail("campaign.campaignId", `must be ${def.id}`);
  const complete = state.battleIndex >= def.battles.length;
  if ((state.status === "complete") !== complete) fail("campaign.status", "does not match battleIndex");
  for (const item of state.companies) {
    if (!def.companies.some((known) => known.id === item.id)) fail("campaign.companies", `has unknown company ${item.id}`);
  }

  let roster: CampaignCompany[] = [];
  let battleIndex = 0;
  state.history.forEach((entry, n) => {
    const path = `campaign.history[${n}]`;
    if (!def.battles.some((battle) => battle.id === entry.battleId)) fail(path, `has unknown battle ${entry.battleId}`);
    const battle = def.battles[battleIndex];
    if (!battle || battle.placeholder) fail(path, `records ${entry.battleId}, but no playable battle comes next`);
    if (entry.battleId !== battle.id) fail(`${path}.battleId`, `must be ${battle.id} (battles are fought in order)`);
    if (entry.scenarioId !== battle.scenarioId) fail(`${path}.scenarioId`, `must be ${battle.scenarioId}`);
    const attempt = state.history.slice(0, n).filter((item) => item.battleId === battle.id).length + 1;
    if (entry.attempt !== attempt) fail(`${path}.attempt`, `must be ${attempt}`);

    const slots = Object.entries(battle.slots);
    if (entry.companies.length !== slots.length) fail(`${path}.companies`, `must have one result per slot (${slots.length})`);
    roster = rosterFor(def, { ...state, companies: roster }, battle);
    let broken = 0;
    // Slot order matters: renown titles already taken depend on it, as in recordBattle.
    for (const [squadId, companyId] of slots) {
      const line = entry.companies.find((item) => item.squadId === squadId);
      if (!line) fail(`${path}.companies`, `has no result for slot ${squadId}`);
      if (line.companyId !== companyId) fail(`${path}.companies`, `slot ${squadId} must be ${companyId}`);
      const company = roster.find((item) => item.id === companyId)!;
      if (line.resolveBefore !== company.resolve) fail(`${path}.companies`, `${companyId} Resolve before must be ${company.resolve}`);
      const earned = settleCompany(roster, company, line.ended, entry.outcome);
      if (line.resolveAfter !== company.resolve) fail(`${path}.companies`, `${companyId} Resolve after must be ${company.resolve}`);
      if (line.renownEarned !== earned) fail(`${path}.companies`, `${companyId} renown earned must be ${earned ?? "none"}`);
      if (line.ended === "routed" || line.ended === "destroyed") broken += 1;
    }
    if (entry.companiesBroken !== broken) fail(`${path}.companiesBroken`, `must be ${broken}`);
    if (entry.outcome !== "defeat") battleIndex += 1;
  });

  if (state.battleIndex !== battleIndex) fail("campaign.battleIndex", `must be ${battleIndex} for this history`);
  if (state.companies.length !== roster.length) fail("campaign.companies", `must be the ${roster.length} companies that have fought`);
  state.companies.forEach((item, index) => {
    if (!sameCompany(item, roster[index])) fail(`campaign.companies[${index}]`, `does not match the history (expected ${roster[index].id})`);
  });
}

/** Replays a Roll campaign's history from its carried snapshot (see loadRollCampaignState). */
function checkRollHistory(state: CampaignState, def: CampaignDefinition, scenarios: EngineScenario[]): void {
  if (state.campaignId !== def.id) fail("campaign.campaignId", `must be ${def.id}`);
  const complete = state.battleIndex >= def.battles.length;
  if ((state.status === "complete") !== complete) fail("campaign.status", "does not match battleIndex");
  const carried = state.carried ?? [];
  const carriedIds = carried.map((item) => item.id);
  if (new Set(carriedIds).size !== carriedIds.length) fail("campaign.carried", "has duplicate ids");
  for (const item of carried) {
    if (def.companies.some((known) => known.id === item.id)) fail("campaign.carried", `${item.id} is one of this campaign's own companies`);
    if (item.from.campaignId === def.id) fail("campaign.carried", `${item.id} cannot come from this campaign`);
  }

  let replay: CampaignState = { campaignId: def.id, battleIndex: 0, status: "inProgress", companies: [], history: [], carried };
  state.history.forEach((entry, n) => {
    const path = `campaign.history[${n}]`;
    const battle = def.battles[replay.battleIndex];
    if (!battle || battle.placeholder) fail(path, `records ${entry.battleId}, but no playable battle comes next`);
    if (entry.battleId !== battle.id) fail(`${path}.battleId`, `must be ${battle.id} (battles are fought in order)`);
    if (entry.scenarioId !== battle.scenarioId) fail(`${path}.scenarioId`, `must be ${battle.scenarioId}`);
    const scenario = scenarios.find((item) => item.id === battle.scenarioId);
    if (!scenario) fail(path, `fights scenario ${battle.scenarioId}, which this build does not have`);
    const attempt = state.history.slice(0, n).filter((item) => item.battleId === battle.id).length + 1;
    if (entry.attempt !== attempt) fail(`${path}.attempt`, `must be ${attempt}`);

    const plan = entry.assignment ?? {};
    const problems = validateAssignment(def, replay, scenario, plan);
    const first = Object.entries(problems)[0];
    if (first) fail(`${path}.assignment`, `is not legal here (${first[0]}: ${first[1]})`);
    const slots = Object.keys(plan);
    if (entry.companies.length !== slots.length) fail(`${path}.companies`, `must have one result per slot (${slots.length})`);

    const roster = rollRoster(def, replay);
    const results = slots.map((squadId, index) => {
      const line = entry.companies[index];
      const linePath = `${path}.companies[${index}]`;
      if (line.squadId !== squadId) fail(`${linePath}.squadId`, `must be ${squadId} (slot order)`);
      if (line.companyId !== plan[squadId]) fail(`${linePath}.companyId`, `must be ${plan[squadId]}`);
      if ((line.levy === true) !== (plan[squadId] === LEVY_ID)) fail(`${linePath}.levy`, "must mark exactly the levy slots");
      const squad = scenario.squads.find((item) => item.id === squadId)!;
      const company = roster.find((item) => item.id === plan[squadId]);
      const role = company?.role ?? (battle.call?.flex?.[squadId]?.roles[0] ?? squad.role);
      const fielded = company ? fieldedProfile(company).strength : LEVY_PROFILE[role].strength;
      if (line.startStrength !== fielded) fail(`${linePath}.startStrength`, `must be ${fielded}`);
      if ((line.ended === "destroyed") !== (line.endStrength === 0)) fail(`${linePath}.endStrength`, "must be 0 exactly when destroyed");
      if ((line.endStrength ?? 0) > fielded) fail(`${linePath}.endStrength`, `cannot exceed the starting strength ${fielded}`);
      if (company && line.resolveBefore !== company.resolve) fail(`${linePath}.resolveBefore`, `must be ${company.resolve}`);
      return { squadId, ended: line.ended, startStrength: line.startStrength, endStrength: line.endStrength ?? 0 };
    });
    const lines = settleRollBattle(roster, plan, entry.outcome, results);
    lines.forEach((line, index) => {
      const saved = entry.companies[index];
      if (saved.resolveAfter !== line.resolveAfter) fail(`${path}.companies[${index}].resolveAfter`, `must be ${line.resolveAfter}`);
      if (saved.renownEarned !== line.renownEarned) fail(`${path}.companies[${index}].renownEarned`, `must be ${line.renownEarned ?? "none"}`);
    });
    const broken = entry.companies.filter((line) => line.ended === "routed" || line.ended === "destroyed").length;
    if (entry.companiesBroken !== broken) fail(`${path}.companiesBroken`, `must be ${broken}`);
    const battleIndex = entry.outcome === "defeat" ? replay.battleIndex : replay.battleIndex + 1;
    replay = { ...replay, battleIndex, status: battleIndex >= def.battles.length ? "complete" : "inProgress", companies: roster };
  });

  if (state.battleIndex !== replay.battleIndex) fail("campaign.battleIndex", `must be ${replay.battleIndex} for this history`);
  const roster = replay.companies;
  if (state.companies.length !== roster.length) fail("campaign.companies", `must be the ${roster.length} companies on the Roll`);
  state.companies.forEach((item, index) => {
    if (!sameCompany(item, roster[index])) fail(`campaign.companies[${index}]`, `does not match the history (expected ${roster[index].id})`);
  });
}
