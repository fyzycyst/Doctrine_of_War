// Campaign packs (M1, P1). A pack is plain, versioned, JSON-able data: campaigns, the
// scenarios they fight, any doctrines the pack adds, and a skirmish list. Packs ship
// compiled in (app updates), but every manifest is validated as if it were untrusted
// input, so a future "Import Campaign…" is a loader rather than a rewrite.
import type { CampaignBattle, CampaignDefinition } from "../campaign/types";
import type { Doctrine, EngineScenario } from "../engine/types";

/**
 * The rules revision of this build: bump it when settlement, conditions or engine rules
 * change the meaning of a saved history. Saves record it; a save from a rules revision
 * this build does not list in SUPPORTED_RULES is preserved but cannot be continued.
 */
export const RULES_REVISION = 1;
export const SUPPORTED_RULES: readonly number[] = [1];
/** Manifest formats (PackRevision.pack) this build reads, and whose saves it continues. */
export const SUPPORTED_PACK_FORMATS: readonly number[] = [1];

export interface PackRevision {
  /** The manifest format (1). */
  pack: number;
  /** Bumped whenever the pack's content changes what a saved history means. */
  content: number;
  /** The rules revision the content was balanced and released against. */
  rules: number;
}

/** One replayable battle offered outside any campaign: fresh seed, authored strength, no save. */
export interface SkirmishEntry {
  id: string;
  title: string;
  scenarioId: string;
}

/** A skirmish as the registry offers it: from a campaign battle, or a standalone manifest entry. */
export interface SkirmishOffer {
  pack: PackManifest;
  skirmish: SkirmishEntry;
  /** Present for a campaign battle: the campaign whose default forces it fights with. */
  campaign?: CampaignDefinition;
  battle?: CampaignBattle;
}

export interface PackManifest {
  /** Lowercase id, unique across packs. */
  id: string;
  title: string;
  revision: PackRevision;
  /** Content revisions whose saves this build still replays; always includes revision.content. */
  readsContent: number[];
  /** Campaigns, in the order the title screen lists them. */
  campaigns: CampaignDefinition[];
  /** Every scenario the campaigns and skirmishes fight. Ids unique across packs. */
  scenarios: EngineScenario[];
  /** Doctrines this pack adds to the core library (none for the shipped packs). Ids unique. */
  doctrines: Doctrine[];
  skirmishes: SkirmishEntry[];
}

/** What a save records about the content it was played on (P3). */
export interface SaveProvenance {
  packId: string;
  /** The pack's manifest format (PackRevision.pack) when the run was saved. */
  packRevision: number;
  campaignId: string;
  contentRevision: number;
  rulesRevision: number;
}

/** Whether a saved run can be continued on this build. */
export type Compatibility = { ok: true } | { ok: false; reason: string };

/** The validated, linted set of packs this build offers. Read-only lookups. */
export interface PackRegistry {
  readonly packs: readonly PackManifest[];
  /** The pack and campaign for a campaign id, or undefined. */
  campaign(id: string): { pack: PackManifest; campaign: CampaignDefinition } | undefined;
  /** A scenario by id from any pack, or undefined. */
  scenario(id: string): EngineScenario | undefined;
  /** Every scenario from every pack (the balance harness runs them all). */
  scenarios(): EngineScenario[];
  /**
   * Every skirmish, pack by pack (T25): every built battle of every campaign, in campaign
   * order (with its campaign and battle), then any of the manifest's own `skirmishes` that
   * fight a scenario no campaign uses. Derived, so a new battle is offered without a list.
   */
  skirmishes(): SkirmishOffer[];
  /** Whether a run recorded with `provenance` can be continued on this build. */
  compatibility(provenance: SaveProvenance): Compatibility;
}

export class PackError extends Error {
  constructor(message: string) {
    super(`Invalid pack: ${message}`);
    this.name = "PackError";
  }
}
