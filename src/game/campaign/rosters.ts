// Reference rosters for balancing campaign battles. Each battle after the first is
// checked against three rosters:
//   baseline: the scenario as authored (no campaign)
//   strong:   the roster the curated path produces (every earlier battle won with its
//             intended plan on its curated seed), veterans, renown and all
//   rough:    a plausible bad run: the strong roster's best company destroyed and
//             reformed at -2 (renown lost), the next two carried companies at -1
import { playBattle, type GuardrailPolicy } from "../engine/balance";
import type { EngineScenario } from "../engine/types";
import { applyCampaign, recordBattle, REFORMED_RESOLVE, rosterFor, startCampaign } from "./campaign";
import { isRollCampaign } from "./roll";
import { rollCalls, type RollCallKind } from "./rollCalls";
import type { CampaignDefinition, CampaignState } from "./types";

export type RosterKind = "baseline" | "strong" | "rough";

function scenarioFor(scenarios: EngineScenario[], id: string): EngineScenario {
  const scenario = scenarios.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown scenario ${id}`);
  return scenario;
}

/** The campaign state at the start of battle `index` along the curated path. */
export function curatedPathState(def: CampaignDefinition, scenarios: EngineScenario[], index: number): CampaignState {
  let state = startCampaign(def);
  for (let battleIndex = 0; battleIndex < index; battleIndex += 1) {
    const battle = def.battles[battleIndex];
    const scenario = scenarioFor(scenarios, battle.scenarioId);
    if (battle.placeholder || !scenario.referencePlans || scenario.curatedSeed === undefined) {
      throw new Error(`Battle ${battle.id} cannot be replayed on the curated path`);
    }
    const final = playBattle(applyCampaign(def, state, scenario), scenario.referencePlans.intended, scenario.curatedSeed, "on");
    state = recordBattle(def, state, final);
    if (state.battleIndex !== battleIndex + 1) {
      throw new Error(`Curated seed for ${battle.id} does not advance the campaign (${final.status})`);
    }
  }
  return state;
}

/** A plausible bad run into battle `index`, derived from the curated path. */
export function roughPathState(def: CampaignDefinition, scenarios: EngineScenario[], index: number): CampaignState {
  const strong = curatedPathState(def, scenarios, index);
  const carried = [...strong.companies].sort((a, b) => b.resolve - a.resolve || strong.companies.indexOf(a) - strong.companies.indexOf(b));
  const rough = structuredClone(strong);
  carried.forEach((company, rank) => {
    const target = rough.companies.find((item) => item.id === company.id)!;
    if (rank === 0) {
      target.resolve = REFORMED_RESOLVE;
      target.renown = null;
      target.reformed += 1;
      target.casualties.destroyed += 1;
    } else if (rank <= 2) {
      target.resolve = -1;
    }
  });
  return rough;
}

export interface BalanceVariant {
  kind: RosterKind | RollCallKind;
  /** Display name (the kind, or a Roll call's name such as "role: bows=frontline"). */
  name?: string;
  /**
   * Guardrail policy: the rough roster is a winnability floor only; "diagnostic" (a Roll
   * campaign's weakest-legal call) is reported, never gated: its recovery force (the
   * recommended call on the same state) is gated instead.
   */
  policy: GuardrailPolicy | "diagnostic";
  scenario: EngineScenario;
  /** Who takes the field (empty for the baseline). */
  roster: string;
}

/**
 * The scenario variants a campaign battle is balanced against: baseline and strong
 * with the full guardrails, rough as a winnability floor. The first battle has no
 * carried roster, so only its baseline is checked.
 */
export function balanceRosters(def: CampaignDefinition, scenarios: EngineScenario[], index: number): BalanceVariant[] {
  const battle = def.battles[index];
  const scenario = scenarioFor(scenarios, battle.scenarioId);
  const variants: BalanceVariant[] = [{ kind: "baseline", policy: "full", scenario, roster: "" }];
  if (index > 0) {
    const strong = curatedPathState(def, scenarios, index);
    const rough = roughPathState(def, scenarios, index);
    variants.push({ kind: "strong", policy: "full", scenario: applyCampaign(def, strong, scenario), roster: describeRoster(def, strong, index) });
    variants.push({ kind: "rough", policy: "floor", scenario: applyCampaign(def, rough, scenario), roster: describeRoster(def, rough, index) });
  }
  return variants;
}

/** Balance variants for any scenario: campaign rosters when it is a playable campaign battle, else the baseline. */
export function balanceVariantsFor(def: CampaignDefinition, scenarios: EngineScenario[], scenario: EngineScenario): BalanceVariant[] {
  const index = def.battles.findIndex((battle) => battle.scenarioId === scenario.id && !battle.placeholder);
  return index < 0 ? [{ kind: "baseline", policy: "full", scenario, roster: "" }] : balanceRosters(def, scenarios, index);
}

/** A completed campaign whose companies a strong player carries into a Roll campaign. */
export interface CarrySource {
  def: CampaignDefinition;
  state: CampaignState;
  packId: string;
}

/**
 * Balance variants for any scenario, across campaigns: a Roll campaign's named calls
 * (rollCalls), a fixed campaign's rosters (balanceVariantsFor), or the baseline.
 */
export function balanceVariantsIn(
  campaigns: readonly CampaignDefinition[],
  scenarios: EngineScenario[],
  scenario: EngineScenario,
  carryFrom?: () => CarrySource,
): BalanceVariant[] {
  const owner = campaigns.find((def) => def.battles.some((battle) => battle.scenarioId === scenario.id && !battle.placeholder));
  if (!owner) return [{ kind: "baseline", policy: "full", scenario, roster: "" }];
  if (!isRollCampaign(owner)) return balanceVariantsFor(owner, scenarios, scenario);
  const index = owner.battles.findIndex((battle) => battle.scenarioId === scenario.id && !battle.placeholder);
  return rollCalls(owner, scenarios, index, index === 0 ? carryFrom?.() : undefined).map((item) => ({
    kind: item.kind,
    name: item.name,
    policy: item.policy,
    scenario: item.scenario,
    roster: item.roster,
  }));
}

/** The intro, completed along its curated path: the source of a strong player's carry-over. */
export function introCarrySource(def: CampaignDefinition, scenarios: EngineScenario[], packId: string): CarrySource {
  return { def, state: curatedPathState(def, scenarios, def.battles.length), packId };
}

/** For reports: each fielded company's Resolve (and renown) in a roster. */
export function describeRoster(def: CampaignDefinition, state: CampaignState, index: number): string {
  return rosterFor(def, state, def.battles[index])
    .filter((company) => Object.values(def.battles[index].slots).includes(company.id))
    .map((company) => `${company.name} ${company.resolve >= 0 ? "+" : ""}${company.resolve}${company.renown ? ` "${company.renown.title}"` : ""}`)
    .join(", ");
}
