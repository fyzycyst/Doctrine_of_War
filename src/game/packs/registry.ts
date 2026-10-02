// The pack registry (M1, P1): `packs -> campaigns -> battles`, plus skirmish lists.
// Every manifest goes through parsePackManifest() (untrusted-data validation) and the
// whole set through lintPacks() (cross-pack id uniqueness and references) before the
// registry exposes anything playable.
import { cinderRoad } from "../campaign/cinderRoad";
import { ashAndBanner } from "../campaign/definition";
import { doctrineLibrary } from "../engine/doctrines";
import { firstBreach } from "../engine/scenarios/firstBreach";
import { emberFord } from "../engine/scenarios/emberFord";
import { saltmarshColumn } from "../engine/scenarios/saltmarshColumn";
import { holdForDawn } from "../engine/scenarios/holdForDawn";
import { cinderRoad1 } from "../engine/scenarios/cinderRoad1";
import type { DoctrineLibrary } from "../engine/types";
import { lintPacks } from "./lint";
import { parsePackManifest } from "./manifest";
import {
  PackError,
  SUPPORTED_PACK_FORMATS,
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
  // Cinder Road (Roll) is in development: battle 1 only until its length is frozen.
  campaigns: [ashAndBanner, cinderRoad],
  scenarios: [firstBreach, emberFord, saltmarshColumn, holdForDawn, cinderRoad1],
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
 * Builds the registry: every manifest is parsed as untrusted data (parsePackManifest) and
 * the parsed copies are linted together (lintPacks). Throws a PackError naming the
 * problems; nothing is exposed from a set that fails. The registry serves the parsed copies.
 */
export function createRegistry(packs: readonly unknown[], core: DoctrineLibrary = doctrineLibrary): PackRegistry {
  const parsed = packs.map((pack) => parsePackManifest(pack));
  const problems = lintPacks(parsed, core);
  if (problems.length > 0) {
    throw new PackError(problems.join("; "));
  }
  const frozen = parsed;
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
  if (!SUPPORTED_PACK_FORMATS.includes(provenance.packRevision) || provenance.packRevision > pack.revision.pack) {
    return { ok: false, reason: `This run was saved by a pack format this build does not read (pack ${provenance.packRevision}).` };
  }
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
