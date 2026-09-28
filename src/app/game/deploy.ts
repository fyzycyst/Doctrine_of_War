// Pre-battle deployment. The engine starts squads on their scenario hexes; the UI
// lets the player move their own squads within the scenario's deployment zone
// before phase 1, then builds the battle from a scenario copy with those hexes.
import { getHex, hexKey, isPassableTerrain, sameHex, type HexCoord } from "../../game/board";
import type { EngineScenario } from "../../game/engine";

export type Deployment = Record<string, HexCoord>;

export type PlacementCheck = { ok: true } | { ok: false; reason: string };

/** The player's squads on their scenario start hexes. */
export function initialDeployment(scenario: EngineScenario): Deployment {
  return Object.fromEntries(
    scenario.squads
      .filter((squad) => squad.faction === scenario.playerFaction)
      .map((squad) => [squad.id, { ...squad.hex }]),
  );
}

/** Every hex in the player's deployment zone (for the board highlight and the deploy list). */
export function deploymentHexes(scenario: EngineScenario): HexCoord[] {
  return scenario.board.hexes
    .filter(
      (hex) =>
        hex.deploymentFaction === scenario.playerFaction &&
        !hex.objectiveId &&
        isPassableTerrain(hex.terrain),
    )
    .map((hex) => ({ ...hex.coord }));
}

/** Where a squad stands under this deployment (player squads) or at its scenario hex (everyone else). */
function occupantAt(scenario: EngineScenario, deployment: Deployment, hex: HexCoord) {
  return scenario.squads.find((squad) => sameHex(deployment[squad.id] ?? squad.hex, hex));
}

export function checkPlacement(
  scenario: EngineScenario,
  deployment: Deployment,
  squadId: string,
  hex: HexCoord,
): PlacementCheck {
  const squad = scenario.squads.find((item) => item.id === squadId);
  if (!squad || squad.faction !== scenario.playerFaction) {
    return { ok: false, reason: "Only your own companies can be deployed." };
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
  const occupant = occupantAt(scenario, deployment, hex);
  if (occupant && occupant.id !== squadId) {
    return { ok: false, reason: `${occupant.name} already holds that hex.` };
  }
  return { ok: true };
}

/** A copy of the scenario with the player's squads moved to their deployed hexes. */
export function applyDeployment(scenario: EngineScenario, deployment: Deployment): EngineScenario {
  return {
    ...scenario,
    squads: scenario.squads.map((squad) =>
      deployment[squad.id] ? { ...squad, hex: { ...deployment[squad.id] } } : squad,
    ),
  };
}

export function hexName(scenario: EngineScenario, hex: HexCoord): string {
  const boardHex = getHex(scenario.board, hex);
  const terrain = boardHex ? boardHex.terrain[0].toUpperCase() + boardHex.terrain.slice(1) : "Hex";
  return boardHex?.label ? `${boardHex.label} (${terrain.toLowerCase()})` : `${terrain} ${hexKey(hex)}`;
}
