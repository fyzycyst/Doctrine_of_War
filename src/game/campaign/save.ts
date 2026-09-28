// Versioned campaign saves. Loading fails closed: anything malformed, oversized,
// from another version or inconsistent with the campaign definition is rejected
// with a CampaignSaveError, never half-loaded. The loaded state is rebuilt field by
// field from validated values, so unknown keys (and __proto__ tricks) are dropped.
import type { SquadRole, SquadStatus } from "../engine/types";
import {
  RESOLVE_MAX,
  RESOLVE_MIN,
  type BattleRecord,
  type CampaignCompany,
  type CampaignDefinition,
  type CampaignState,
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
  return value;
}

function oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): T {
  if (typeof value !== "string" || !options.includes(value as T)) fail(path, `must be one of ${options.join(", ")}`);
  return value as T;
}

function nullableTitle(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}

function company(value: unknown, path: string): CampaignCompany {
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
  };
}

function result(value: unknown, path: string): CompanyResult {
  const raw = object(value, path);
  return {
    companyId: id(raw.companyId, `${path}.companyId`),
    squadId: id(raw.squadId, `${path}.squadId`),
    ended: oneOf(raw.ended, `${path}.ended`, ENDINGS),
    resolveBefore: int(raw.resolveBefore, `${path}.resolveBefore`, RESOLVE_MIN, RESOLVE_MAX),
    resolveAfter: int(raw.resolveAfter, `${path}.resolveAfter`, RESOLVE_MIN, RESOLVE_MAX),
    renownEarned: nullableTitle(raw.renownEarned, `${path}.renownEarned`),
  };
}

function record(value: unknown, path: string): BattleRecord {
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
    companies: array(raw.companies, `${path}.companies`, MAX_COMPANIES).map((item, index) => result(item, `${path}.companies[${index}]`)),
  };
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
  const raw = object(envelope.campaign, "campaign");

  const maxIndex = definition ? definition.battles.length : 1000;
  const state: CampaignState = {
    campaignId: id(raw.campaignId, "campaign.campaignId"),
    battleIndex: int(raw.battleIndex, "campaign.battleIndex", 0, maxIndex),
    status: oneOf(raw.status, "campaign.status", ["inProgress", "complete"] as const),
    companies: array(raw.companies, "campaign.companies", MAX_COMPANIES).map((item, index) =>
      company(item, `campaign.companies[${index}]`),
    ),
    history: array(raw.history, "campaign.history", MAX_HISTORY).map((item, index) => record(item, `campaign.history[${index}]`)),
  };

  const ids = state.companies.map((item) => item.id);
  if (new Set(ids).size !== ids.length) fail("campaign.companies", "has duplicate ids");

  if (definition) {
    if (state.campaignId !== definition.id) fail("campaign.campaignId", `must be ${definition.id}`);
    const complete = state.battleIndex >= definition.battles.length;
    if ((state.status === "complete") !== complete) fail("campaign.status", "does not match battleIndex");
    for (const item of state.companies) {
      if (!definition.companies.some((known) => known.id === item.id)) fail("campaign.companies", `has unknown company ${item.id}`);
    }
    for (const entry of state.history) {
      if (!definition.battles.some((battle) => battle.id === entry.battleId)) fail("campaign.history", `has unknown battle ${entry.battleId}`);
      for (const line of entry.companies) {
        if (!ids.includes(line.companyId)) fail("campaign.history", `references company ${line.companyId} not in the roster`);
      }
    }
  }
  return state;
}
