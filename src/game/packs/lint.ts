// lintPacks (P1): references and cross-pack uniqueness over parsed packs.
import { validateCampaignDefinition } from "../campaign/campaign";
import { isRollCampaign, lintRollCampaign } from "../campaign/roll";
import { LEVY_ID } from "../campaign/types";
import { getHex, hexKey, isPassableTerrain } from "../board";
import { reservedRangeOf } from "../engine/balance";
import { validateWinCondition } from "../engine/outcome";
import type { DoctrineLibrary, EngineScenario } from "../engine/types";
import type { PackManifest } from "./types";

/** Records each id once per namespace and reports the second (and later) owners. */
function uniqueness(problems: string[]) {
  const seen = new Map<string, string>();
  return (namespace: string, id: string, owner: string) => {
    const key = `${namespace}:${id}`;
    const first = seen.get(key);
    if (first) problems.push(`${namespace} id ${id} is used by ${first} and ${owner}`);
    else seen.set(key, owner);
  };
}

/** One scenario's internal references, against the doctrine library it plays with. */
export function lintScenario(scenario: EngineScenario, doctrines: DoctrineLibrary): string[] {
  const problems: string[] = [];
  const at = (problem: string) => problems.push(`scenario ${scenario.id}: ${problem}`);
  const { board } = scenario;

  const cells = new Set<string>();
  for (const cell of board.hexes) {
    const key = hexKey(cell.coord);
    if (cell.coord.q >= board.width || cell.coord.r >= board.height) at(`hex ${key} is outside the ${board.width}x${board.height} board`);
    if (cells.has(key)) at(`hex ${key} is listed twice`);
    cells.add(key);
  }
  if (cells.size !== board.width * board.height) at(`the board must list all ${board.width * board.height} hexes`);

  const squadIds = new Set<string>();
  const occupied = new Set<string>();
  for (const squad of scenario.squads) {
    if (squadIds.has(squad.id)) at(`squad ${squad.id} is listed twice`);
    squadIds.add(squad.id);
    const cell = getHex(board, squad.hex);
    if (!cell || !isPassableTerrain(cell.terrain)) at(`squad ${squad.id} does not start on open ground`);
    if (occupied.has(hexKey(squad.hex))) at(`two squads start on ${hexKey(squad.hex)}`);
    occupied.add(hexKey(squad.hex));
    const doctrine = doctrines[squad.doctrineId];
    if (!doctrine) at(`squad ${squad.id} has unknown doctrine ${squad.doctrineId}`);
    else if (doctrine.faction !== squad.faction) at(`squad ${squad.id} has the other side's doctrine ${squad.doctrineId}`);
    if (squad.noncombatant && squad.faction !== scenario.playerFaction) at(`noncombatant ${squad.id} must be the player's`);
  }
  if (!scenario.squads.some((squad) => squad.faction === scenario.playerFaction)) at("has no player squads");
  if (!scenario.squads.some((squad) => squad.faction !== scenario.playerFaction)) at("has no opposing squads");

  const objectiveIds = new Set<string>();
  for (const objective of scenario.objectives) {
    if (objectiveIds.has(objective.id)) at(`objective ${objective.id} is listed twice`);
    objectiveIds.add(objective.id);
    if (!getHex(board, objective.hex)) at(`objective ${objective.id} is off the board`);
  }
  for (const cell of board.hexes) {
    if (cell.objectiveId && !objectiveIds.has(cell.objectiveId)) at(`hex ${hexKey(cell.coord)} names unknown objective ${cell.objectiveId}`);
  }

  for (const doctrineId of scenario.playerDoctrineIds) {
    const doctrine = doctrines[doctrineId];
    if (!doctrine) at(`player doctrine ${doctrineId} does not exist`);
    else if (doctrine.faction !== scenario.playerFaction) at(`player doctrine ${doctrineId} belongs to the other side`);
  }
  const phases = new Set<number>();
  for (const entry of scenario.hostSchedule) {
    if (entry.phase > scenario.maxPhases) at(`host schedule phase ${entry.phase} is past maxPhases`);
    if (phases.has(entry.phase)) at(`host schedule lists phase ${entry.phase} twice`);
    phases.add(entry.phase);
    for (const [squadId, doctrineId] of Object.entries(entry.orders)) {
      const squad = scenario.squads.find((item) => item.id === squadId);
      if (!squad || squad.faction === scenario.playerFaction) at(`phase ${entry.phase} orders unknown host squad ${squadId}`);
      const doctrine = doctrines[doctrineId];
      if (!doctrine || (squad && doctrine.faction !== squad.faction)) at(`phase ${entry.phase} orders ${squadId} onto ${doctrineId}, not a host doctrine`);
    }
  }

  const companies = scenario.squads.filter((squad) => squad.faction === scenario.playerFaction && !squad.noncombatant).map((squad) => squad.id);
  for (const [name, plan] of Object.entries(scenario.referencePlans ?? {})) {
    const keys = Object.keys(plan).sort();
    if (keys.join() !== [...companies].sort().join()) at(`reference plan ${name} must order exactly the player's companies`);
    for (const doctrineId of Object.values(plan)) {
      if (!scenario.playerDoctrineIds.includes(doctrineId)) at(`reference plan ${name} uses ${doctrineId}, not a player doctrine here`);
    }
  }
  const reserved = scenario.curatedSeed === undefined ? null : reservedRangeOf(scenario.curatedSeed);
  if (reserved) {
    const where = reserved.name === "gate" ? "the held-out balance gate range" : `the reserved sign-off range ${reserved.name}`;
    at(`curated seed ${scenario.curatedSeed} is in ${where} (${reserved.first}..${reserved.first + reserved.size - 1})`);
  }
  try {
    validateWinCondition(scenario);
  } catch (error) {
    at((error as Error).message);
  }
  return problems;
}

/**
 * Cross-pack lint, against the core doctrine library: ids unique across all packs (packs,
 * campaigns, companies, scenarios, doctrines, skirmishes; battles within a campaign);
 * every scenario a campaign or skirmish names exists; every scenario's own references
 * hold; each campaign is valid against its scenarios (fixed or Roll rules). Returns a list
 * of problems, empty when the set is clean.
 */
export function lintPacks(packs: readonly PackManifest[], core: DoctrineLibrary): string[] {
  const problems: string[] = [];
  const unique = uniqueness(problems);
  const doctrines: DoctrineLibrary = { ...core };
  for (const doctrineId of Object.keys(core)) unique("doctrine", doctrineId, "the core library");

  for (const pack of packs) {
    unique("pack", pack.id, `pack ${pack.id}`);
    if (!pack.readsContent.includes(pack.revision.content)) problems.push(`pack ${pack.id}: readsContent must include its own content revision`);
    for (const doctrine of pack.doctrines) {
      unique("doctrine", doctrine.id, `pack ${pack.id}`);
      doctrines[doctrine.id] = doctrine;
    }
    for (const scenario of pack.scenarios) unique("scenario", scenario.id, `pack ${pack.id}`);
    for (const skirmish of pack.skirmishes) unique("skirmish", skirmish.id, `pack ${pack.id}`);
    for (const campaign of pack.campaigns) {
      unique("campaign", campaign.id, `pack ${pack.id}`);
      for (const company of campaign.companies) {
        // Unique across campaigns too: carry-over brings companies into other campaigns' saves.
        unique("company", company.id, `campaign ${campaign.id}`);
        if (company.id === LEVY_ID) problems.push(`campaign ${campaign.id}: "${LEVY_ID}" is reserved for levies`);
      }
    }
  }

  for (const pack of packs) {
    const own = (scenarioId: string) => pack.scenarios.find((item) => item.id === scenarioId);
    for (const scenario of pack.scenarios) problems.push(...lintScenario(scenario, doctrines));
    for (const skirmish of pack.skirmishes) {
      if (!own(skirmish.scenarioId)) problems.push(`pack ${pack.id}: skirmish ${skirmish.id} names scenario ${skirmish.scenarioId}, not in this pack`);
    }
    for (const campaign of pack.campaigns) {
      const battleIds = new Set<string>();
      for (const battle of campaign.battles) {
        if (battleIds.has(battle.id)) problems.push(`campaign ${campaign.id}: battle ${battle.id} is listed twice`);
        battleIds.add(battle.id);
        if (!battle.placeholder && !own(battle.scenarioId)) {
          problems.push(`campaign ${campaign.id}: battle ${battle.id} names scenario ${battle.scenarioId}, not in this pack`);
        }
      }
      const found = isRollCampaign(campaign)
        ? lintRollCampaign(campaign, pack.scenarios)
        : validateCampaignDefinition(campaign, pack.scenarios);
      problems.push(...found.map((problem) => `campaign ${campaign.id}: ${problem}`));
    }
  }
  return problems;
}
