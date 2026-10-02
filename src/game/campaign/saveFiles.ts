// Per-campaign saves (M1, P3). One save per campaign, keyed by an ALLOWLISTED campaign
// id. The intro (Ash & Banner) keeps its v1 file and localStorage key, byte for byte as
// today: no migration, and it goes on being written exactly as before. Every other
// campaign writes a v2 envelope that records the pack, content and rules revisions it was
// played on.
//
// A v2 save that cannot be continued on this build (missing pack, another content or
// rules revision, or simply unreadable) is reported, preserved and never overwritten:
// saveCampaignRun refuses to replace it until the player explicitly sets it aside, which
// keeps a copy. Each v2 write keeps the previous good save as a backup.
import { RULES_REVISION, type PackRegistry, type SaveProvenance } from "../packs/types";
import { byteLength, CampaignSaveError, loadCampaign, loadRollCampaignState, MAX_SAVE_BYTES, saveCampaign } from "./save";
import type { CampaignState } from "./types";

/** v2: the envelope for every campaign except the intro (which stays on v1). */
export const SAVE_VERSION_V2 = 2;

/** The campaign whose save is the untouched v1 file (and v1 localStorage key). */
export const INTRO_CAMPAIGN_ID = "ash_and_banner";

/**
 * Size budget for one v2 run, in UTF-8 bytes. One file per campaign, so the budget is per
 * campaign, not shared: later packs add files, never bytes to this one. A full 11-battle
 * Roll campaign with dozens of retries stays far under it (see saveFiles.test).
 */
export const MAX_RUN_BYTES = 512 * 1024;

/**
 * The fixed allowlist: campaign id -> save file name in Electron's userData. The main
 * process keeps its own literal copy of this map (electron/saveFile.ts, checked equal by
 * a test) and accepts no campaign id outside it; the renderer never supplies a path.
 * Add an entry when a campaign ships.
 */
export const CAMPAIGN_SAVE_FILES: Readonly<Record<string, string>> = Object.freeze({
  ash_and_banner: "campaign-save.json",
  cinder_road: "campaign-cinder_road.json",
});

export function isSaveCampaignId(campaignId: unknown): campaignId is string {
  return typeof campaignId === "string" && Object.hasOwn(CAMPAIGN_SAVE_FILES, campaignId);
}

function requireSaveId(campaignId: unknown): string {
  if (!isSaveCampaignId(campaignId)) throw new CampaignSaveError(`no save slot for campaign ${String(campaignId).slice(0, 64)}`);
  return campaignId;
}

/** The shipped v1 key (storage.ts's LOCAL_STORAGE_KEY; kept literal so main can import this module). */
const V1_KEY = "doctrine-of-war:campaign";

/** The browser's localStorage key for a campaign (the intro's is the shipped v1 key). */
export function localStorageKeyFor(campaignId: string): string {
  requireSaveId(campaignId);
  return campaignId === INTRO_CAMPAIGN_ID ? V1_KEY : `${V1_KEY}:${campaignId}`;
}

/** A v2 save file. */
export interface CampaignSaveEnvelope {
  version: typeof SAVE_VERSION_V2;
  provenance: SaveProvenance;
  campaign: CampaignState;
}

/** What reading a campaign's save found. Nothing but `ok` may be continued; nothing but `empty` and `ok` may be overwritten. */
export type CampaignSaveRead =
  | { kind: "empty" }
  | { kind: "ok"; state: CampaignState; provenance: SaveProvenance }
  /** A well-formed run this build cannot continue (other pack or revision): kept as is. */
  | { kind: "unavailable"; reason: string; provenance: SaveProvenance }
  /** Not a save this build can read at all: kept as is. */
  | { kind: "unreadable"; reason: string };

/** The provenance a run gets on this build. */
function provenanceOf(registry: PackRegistry, campaignId: string): SaveProvenance {
  const entry = registry.campaign(campaignId);
  if (!entry) throw new CampaignSaveError(`campaign ${campaignId} is not in this build`);
  return {
    packId: entry.pack.id,
    packRevision: entry.pack.revision.pack,
    campaignId,
    contentRevision: entry.pack.revision.content,
    rulesRevision: RULES_REVISION,
  };
}

/** Serializes a campaign's state for its own file (v1 for the intro, v2 otherwise). Throws past the size budget. */
export function serializeCampaignSave(registry: PackRegistry, state: CampaignState): string {
  const campaignId = requireSaveId(state.campaignId);
  if (campaignId === INTRO_CAMPAIGN_ID) return saveCampaign(state);
  const envelope: CampaignSaveEnvelope = { version: SAVE_VERSION_V2, provenance: provenanceOf(registry, campaignId), campaign: state };
  const json = JSON.stringify(envelope);
  if (byteLength(json) > MAX_RUN_BYTES) throw new CampaignSaveError(`save is larger than ${MAX_RUN_BYTES} bytes`);
  return json;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isRevision = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10_000;

function readProvenance(value: unknown): SaveProvenance {
  const id = /^[a-z0-9_]{1,64}$/;
  if (!isObject(value)) throw new CampaignSaveError("save.provenance must be an object");
  const unknown = Object.keys(value).filter((key) => !["packId", "packRevision", "campaignId", "contentRevision", "rulesRevision"].includes(key));
  if (unknown.length > 0) throw new CampaignSaveError(`save.provenance has unknown fields: ${unknown.join(", ").slice(0, 120)}`);
  const { packId, packRevision, campaignId, contentRevision, rulesRevision } = value;
  if (typeof packId !== "string" || !id.test(packId)) throw new CampaignSaveError("save.provenance.packId must be a lowercase id");
  if (typeof campaignId !== "string" || !id.test(campaignId)) throw new CampaignSaveError("save.provenance.campaignId must be a lowercase id");
  if (!isRevision(packRevision) || !isRevision(contentRevision) || !isRevision(rulesRevision)) {
    throw new CampaignSaveError("save.provenance revisions (pack, content, rules) must be integers in 1..10000");
  }
  return { packId, packRevision: packRevision as number, campaignId, contentRevision: contentRevision as number, rulesRevision: rulesRevision as number };
}

const message = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

/** Parses one campaign's stored payload (null = no save) with full validation and replay. Never throws. */
export function readCampaignSave(registry: PackRegistry, campaignId: string, payload: string | null): CampaignSaveRead {
  if (payload === null) return { kind: "empty" };
  if (!isSaveCampaignId(campaignId)) return { kind: "unreadable", reason: `No save slot for campaign ${campaignId}.` };
  if (campaignId === INTRO_CAMPAIGN_ID) {
    const intro = registry.campaign(INTRO_CAMPAIGN_ID);
    if (!intro) return { kind: "unreadable", reason: "This build does not have the intro campaign." };
    try {
      return { kind: "ok", state: loadCampaign(payload, intro.campaign), provenance: provenanceOf(registry, INTRO_CAMPAIGN_ID) };
    } catch (error) {
      return { kind: "unreadable", reason: message(error) };
    }
  }
  try {
    if (typeof payload !== "string" || byteLength(payload) > MAX_RUN_BYTES) throw new CampaignSaveError(`save is larger than ${MAX_RUN_BYTES} bytes`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new CampaignSaveError("save is not valid JSON");
    }
    if (!isObject(parsed)) throw new CampaignSaveError("save must be an object");
    if (parsed.version !== SAVE_VERSION_V2) throw new CampaignSaveError(`save.version must be ${SAVE_VERSION_V2}`);
    const provenance = readProvenance(parsed.provenance);
    if (provenance.campaignId !== campaignId) throw new CampaignSaveError(`save belongs to campaign ${provenance.campaignId}, not ${campaignId}`);
    const compatible = registry.compatibility(provenance);
    if (!compatible.ok) return { kind: "unavailable", reason: compatible.reason, provenance };
    const entry = registry.campaign(campaignId)!;
    const sourceOf = (origin: { packId: string; campaignId: string }) => {
      const source = registry.campaign(origin.campaignId);
      return source && source.pack.id === origin.packId ? source.campaign : undefined;
    };
    const state = loadRollCampaignState(parsed.campaign, entry.campaign, entry.pack.scenarios, sourceOf);
    return { kind: "ok", state, provenance };
  } catch (error) {
    return { kind: "unreadable", reason: message(error) };
  }
}

/** Per-campaign storage: browser localStorage keys or Electron's allowlisted userData files. */
export interface CampaignSaveStore {
  read(campaignId: string): Promise<string | null>;
  /** Replaces the save (atomically in Electron). For v2 campaigns the previous save is kept as its backup. */
  write(campaignId: string, data: string): Promise<void>;
  /** The save before the current one, or null. */
  readBackup(campaignId: string): Promise<string | null>;
  /**
   * Moves the current save aside (kept, never deleted or replaced) so a fresh run can
   * start. Refused for the intro, and once MAX_ASIDES set-aside runs are kept.
   */
  setAside(campaignId: string): Promise<void>;
}

/** Loads a campaign's run: `ok` to continue, or why not. Never writes. */
export async function loadCampaignRun(store: CampaignSaveStore, registry: PackRegistry, campaignId: string): Promise<CampaignSaveRead> {
  return readCampaignSave(registry, campaignId, await store.read(campaignId));
}

/** The run in the backup slot, for recovery after a damaged save. Never writes. */
export async function loadCampaignBackup(store: CampaignSaveStore, registry: PackRegistry, campaignId: string): Promise<CampaignSaveRead> {
  return readCampaignSave(registry, campaignId, await store.readBackup(campaignId));
}

/** Thrown when a write would replace a run that must be preserved. */
export const PRESERVED_RUN = "That save cannot be continued on this version, and it is kept: set it aside before starting again.";

/**
 * Saves a run. Refuses (throws) when the slot currently holds a v2 run this build cannot
 * continue or read, or one of another campaign: preserved runs are never overwritten.
 * The intro's v1 save is written exactly as before.
 */
export async function saveCampaignRun(store: CampaignSaveStore, registry: PackRegistry, state: CampaignState): Promise<void> {
  const data = serializeCampaignSave(registry, state);
  if (state.campaignId !== INTRO_CAMPAIGN_ID) {
    const current = readCampaignSave(registry, state.campaignId, await store.read(state.campaignId));
    if (current.kind === "unavailable" || current.kind === "unreadable") throw new CampaignSaveError(PRESERVED_RUN);
  }
  await store.write(state.campaignId, data);
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * At most this many set-aside runs are kept per campaign. Set-aside runs are never
 * deleted or replaced: past the limit, setting another aside is refused instead.
 * Mirrored in electron/saveFile.ts.
 */
export const MAX_ASIDES = 8;
export const TOO_MANY_ASIDES = `This campaign already has ${MAX_ASIDES} set-aside saves, which are kept. Export or remove one before setting another aside.`;
export const INTRO_NOT_SET_ASIDE = "The intro's save is never set aside.";
/** The browser key of set-aside slot `slot` (1..MAX_ASIDES). */
export const asideKey = (key: string, slot: number) => `${key}:aside:${slot}`;

/** localStorage, one key per campaign (plus `:backup` and `:aside` for v2 campaigns). */
export function localStorageCampaignStore(storage: KeyValueStorage | null): CampaignSaveStore {
  const need = () => {
    if (!storage) throw new CampaignSaveError("local storage is not available");
    return storage;
  };
  const guarded = <T>(action: string, task: () => T): T => {
    try {
      return task();
    } catch (error) {
      if (error instanceof CampaignSaveError) throw error;
      throw new CampaignSaveError(`local storage could not be ${action} (${error instanceof Error ? error.name : "unknown error"})`);
    }
  };
  return {
    async read(campaignId) {
      const key = localStorageKeyFor(campaignId);
      return guarded("read", () => need().getItem(key));
    },
    async write(campaignId, data) {
      const key = localStorageKeyFor(campaignId);
      guarded("written", () => {
        const store = need();
        if (campaignId !== INTRO_CAMPAIGN_ID) {
          const previous = store.getItem(key);
          if (previous !== null) store.setItem(`${key}:backup`, previous);
        }
        store.setItem(key, data);
      });
    },
    async readBackup(campaignId) {
      const key = localStorageKeyFor(campaignId);
      return guarded("read", () => need().getItem(`${key}:backup`));
    },
    async setAside(campaignId) {
      if (campaignId === INTRO_CAMPAIGN_ID) throw new CampaignSaveError(INTRO_NOT_SET_ASIDE);
      const key = localStorageKeyFor(campaignId);
      guarded("written", () => {
        const store = need();
        const current = store.getItem(key);
        if (current === null) return;
        // A fresh slot every time: an earlier set-aside run is never replaced or deleted.
        let slot = 1;
        while (slot <= MAX_ASIDES && store.getItem(asideKey(key, slot)) !== null) slot += 1;
        if (slot > MAX_ASIDES) throw new CampaignSaveError(TOO_MANY_ASIDES);
        store.setItem(asideKey(key, slot), current);
        if (store.getItem(asideKey(key, slot)) !== current) throw new CampaignSaveError("the set-aside copy could not be verified");
        store.removeItem(key);
      });
    },
  };
}

/** The Electron preload bridge for campaign saves (electron/preload.ts). */
export interface CampaignSavesBridge {
  read(campaignId?: string): Promise<string | null>;
  write(data: string, campaignId?: string): Promise<void>;
  readBackup?(campaignId: string): Promise<string | null>;
  setAside?(campaignId: string): Promise<void>;
}

/** Electron's allowlisted userData files, through the preload bridge. Main re-checks every id and payload. */
export function electronCampaignStore(bridge: CampaignSavesBridge): CampaignSaveStore {
  const missing = () => Promise.reject(new CampaignSaveError("this build's save bridge has no backups"));
  return {
    read: (campaignId) => bridge.read(requireSaveId(campaignId)),
    write: (campaignId, data) => bridge.write(data, requireSaveId(campaignId)),
    readBackup: (campaignId) => (bridge.readBackup ? bridge.readBackup(requireSaveId(campaignId)) : missing()),
    setAside: (campaignId) => (bridge.setAside ? bridge.setAside(requireSaveId(campaignId)) : missing()),
  };
}

export { MAX_SAVE_BYTES };
