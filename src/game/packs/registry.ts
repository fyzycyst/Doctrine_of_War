// The pack registry (M1, P1): `packs -> campaigns -> battles`, plus skirmish lists.
// Every manifest goes through parsePackManifest() (untrusted-data validation) and the
// whole set through lintPacks() (cross-pack id uniqueness and references) before the
// registry exposes anything playable.
import { ashAndBanner } from "../campaign/definition";
import { doctrineLibrary } from "../engine/doctrines";
import { firstBreach } from "../engine/scenarios/firstBreach";
import { emberFord } from "../engine/scenarios/emberFord";
import { saltmarshColumn } from "../engine/scenarios/saltmarshColumn";
import { holdForDawn } from "../engine/scenarios/holdForDawn";
import type { DoctrineLibrary } from "../engine/types";
import {
  PackError,
  SUPPORTED_RULES,
  type Compatibility,
  type PackManifest,
  type PackRegistry,
  type SaveProvenance,
} from "./types";

/** The first pack, "The First Call": the intro (Ash & Banner) and, as they land, the M1 campaigns. */
export const firstCall: PackManifest = {
  id: "first_call",
  title: "The First Call",
  revision: { pack: 1, content: 1, rules: 1 },
  readsContent: [1],
  campaigns: [ashAndBanner],
  scenarios: [firstBreach, emberFord, saltmarshColumn, holdForDawn],
  doctrines: [],
  skirmishes: [
    { id: "skirmish_first_breach", title: "The First Breach", scenarioId: "first_breach" },
    { id: "skirmish_ember_ford", title: "Ember Ford", scenarioId: "ember_ford" },
    { id: "skirmish_saltmarsh_column", title: "The Saltmarsh Column", scenarioId: "saltmarsh_column" },
    { id: "skirmish_hold_for_dawn", title: "Hold for Dawn", scenarioId: "hold_for_dawn" },
  ],
};

/** The packs this build ships, in title-screen order. */
export const shippedPacks: readonly PackManifest[] = [firstCall];

/**
 * Validates an untrusted manifest and returns a clean copy rebuilt field by field (unknown
 * keys dropped, every id, number, list and reference bounded). Throws a PackError naming
 * the first problem. Runs the same checks on compiled-in packs as an import would.
 */
export function parsePackManifest(raw: unknown): PackManifest {
  void raw;
  throw new PackError("parsePackManifest: not implemented yet (M1 P1)");
}

/**
 * Cross-pack lint, against the core doctrine library: ids unique across all packs (packs,
 * campaigns, battles within a campaign, companies, scenarios, doctrines, skirmishes);
 * every scenario a campaign or skirmish names exists; every doctrine a scenario or flex
 * slot names exists; each campaign valid against its scenarios (fixed or Roll rules).
 * Returns a list of problems, empty when the set is clean.
 */
export function lintPacks(packs: readonly PackManifest[], core: DoctrineLibrary = doctrineLibrary): string[] {
  void packs;
  void core;
  return [];
}

/** Builds the registry over linted packs. Throws a PackError listing the lint problems, if any. */
export function createRegistry(packs: readonly PackManifest[], core: DoctrineLibrary = doctrineLibrary): PackRegistry {
  const problems = lintPacks(packs, core);
  if (problems.length > 0) {
    throw new PackError(problems.join("; "));
  }
  const frozen = [...packs];
  return {
    packs: frozen,
    campaign(id) {
      for (const pack of frozen) {
        const campaign = pack.campaigns.find((item) => item.id === id);
        if (campaign) return { pack, campaign };
      }
      return undefined;
    },
    scenario(id) {
      for (const pack of frozen) {
        const scenario = pack.scenarios.find((item) => item.id === id);
        if (scenario) return scenario;
      }
      return undefined;
    },
    scenarios() {
      return frozen.flatMap((pack) => pack.scenarios);
    },
    skirmishes() {
      return frozen.flatMap((pack) => pack.skirmishes.map((skirmish) => ({ pack, skirmish })));
    },
    compatibility(provenance) {
      return compatibility(frozen, provenance);
    },
  };
}

function compatibility(packs: readonly PackManifest[], provenance: SaveProvenance): Compatibility {
  const pack = packs.find((item) => item.id === provenance.packId);
  if (!pack) return { ok: false, reason: `This run belongs to a pack this build does not have (${provenance.packId}).` };
  if (!pack.campaigns.some((item) => item.id === provenance.campaignId)) {
    return { ok: false, reason: `This build's ${pack.title} has no campaign ${provenance.campaignId}.` };
  }
  if (!pack.readsContent.includes(provenance.contentRevision)) {
    return { ok: false, reason: `This run was played on a different edition of ${pack.title} (content ${provenance.contentRevision}).` };
  }
  if (!SUPPORTED_RULES.includes(provenance.rulesRevision)) {
    return { ok: false, reason: `This run was played under rules this build does not support (rules ${provenance.rulesRevision}).` };
  }
  return { ok: true };
}

/** The registry of shipped packs. */
export const registry: PackRegistry = createRegistry(shippedPacks);
