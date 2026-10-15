// Pre-battle deployment: the player may move their own companies within the
// scenario's deployment zone before phase 1. The engine owns the rules (and the
// plain-language reasons shown to the player); the app only collects placements.
import { getHex, isPassableTerrain, sameHex, type HexCoord } from "../board";
import type { EngineScenario } from "./types";

/** squadId -> chosen start hex, for the player's squads only. */
export type Placements = Record<string, HexCoord>;

export type PlacementCheck = { ok: true } | { ok: false; reason: string };

/** Every hex in the player's deployment zone (for the board highlight and the deploy list). */
export function deploymentHexes(scenario: EngineScenario): HexCoord[] {
  return scenario.board.hexes
    .filter((hex) => hex.deploymentFaction === scenario.playerFaction && !hex.objectiveId && isPassableTerrain(hex.terrain))
    .map((hex) => ({ ...hex.coord }));
}

/** Whether `squadId` may start on `hex`, given the other placements. */
export function checkPlacement(scenario: EngineScenario, placements: Placements, squadId: string, hex: HexCoord): PlacementCheck {
  const squad = scenario.squads.find((item) => item.id === squadId);
  if (!squad || squad.faction !== scenario.playerFaction) {
    return { ok: false, reason: "Only your own companies can be deployed." };
  }
  if (squad.noncombatant && !sameHex(hex, squad.hex)) {
    // The refugees start where they are (a placement on their own start hex is no move).
    return { ok: false, reason: "The Column moves on its own orders." };
  }
  const boardHex = getHex(scenario.board, hex);
  if (!boardHex) {
    return { ok: false, reason: "That hex is off the field." };
  }
  if (boardHex.objectiveId) {
    return { ok: false, reason: `${boardHex.label ?? "The objective"} cannot be garrisoned.` };
  }
  if (!isPassableTerrain(boardHex.terrain)) {
    return { ok: false, reason: `No company can stand on ${boardHex.terrain === "river" ? "deep river" : "the wall"}.` };
  }
  if (boardHex.deploymentFaction !== scenario.playerFaction) {
    return { ok: false, reason: "Outside your deployment zone. Pick a highlighted hex." };
  }
  const others = { ...placements, [squadId]: hex };
  const clash = scenario.squads.find(
    (other) => other.id !== squadId && sameHex(others[other.id] ?? other.hex, hex),
  );
  if (clash) {
    return { ok: false, reason: `${clash.name} already holds that hex.` };
  }
  return { ok: true };
}

/** Per-squad reasons for every placement that is not allowed; empty when the deployment is valid. */
export function validateDeployment(scenario: EngineScenario, placements: Placements): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const [squadId, hex] of Object.entries(placements)) {
    const check = checkPlacement(scenario, placements, squadId, hex);
    if (!check.ok) {
      problems[squadId] = check.reason;
    }
  }
  return problems;
}

/** A copy of the scenario with the player's squads on their deployed hexes. Throws if any placement is illegal. */
export function applyDeployment(scenario: EngineScenario, placements: Placements): EngineScenario {
  const problems = validateDeployment(scenario, placements);
  const first = Object.entries(problems)[0];
  if (first) {
    throw new Error(`Invalid deployment for ${first[0]}: ${first[1]}`);
  }
  return {
    ...scenario,
    squads: scenario.squads.map((squad) => (placements[squad.id] ? { ...squad, hex: { ...placements[squad.id] } } : squad)),
  };
}
