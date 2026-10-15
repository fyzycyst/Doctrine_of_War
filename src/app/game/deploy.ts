// Pre-battle deployment. The rules and their plain-language reasons live in the
// engine (src/game/engine/deployment.ts); this module keeps the app's names and the
// UI-only helpers.
import { getHex, hexKey, type HexCoord } from "../../game/board";
import {
  applyDeployment as engineApplyDeployment,
  checkPlacement as engineCheckPlacement,
  deploymentHexes as engineDeploymentHexes,
  validateDeployment,
  type EngineScenario,
  type PlacementCheck,
  type Placements,
} from "../../game/engine";

export type Deployment = Placements;
export type { PlacementCheck };
export { validateDeployment };

/** The player's squads on their scenario start hexes. */
export function initialDeployment(scenario: EngineScenario): Deployment {
  return Object.fromEntries(
    scenario.squads
      .filter((squad) => squad.faction === scenario.playerFaction)
      .map((squad) => [squad.id, { ...squad.hex }]),
  );
}

/** Every hex in the player's deployment zone (for the board highlight and the deploy list). */
export const deploymentHexes = engineDeploymentHexes;

export function checkPlacement(scenario: EngineScenario, deployment: Deployment, squadId: string, hex: HexCoord): PlacementCheck {
  return engineCheckPlacement(scenario, deployment, squadId, hex);
}

/** A copy of the scenario with the player's squads moved to their deployed hexes. */
export function applyDeployment(scenario: EngineScenario, deployment: Deployment): EngineScenario {
  return engineApplyDeployment(scenario, deployment);
}

export function hexName(scenario: EngineScenario, hex: HexCoord): string {
  const boardHex = getHex(scenario.board, hex);
  const terrain = boardHex ? boardHex.terrain[0].toUpperCase() + boardHex.terrain.slice(1) : "Hex";
  return boardHex?.label ? `${boardHex.label} (${terrain.toLowerCase()})` : `${terrain} ${hexKey(hex)}`;
}
