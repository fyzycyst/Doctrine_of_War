import { firstBreachScenario } from "../../game/scenario";
import type { DioramaSquad } from "../figures/types";

/**
 * The First Breach deployment as the lab shows it: the scenario's squads on
 * their scenario hexes, Banners facing west toward the Host, Host facing east.
 * One Host squad is shown mid-battle and depleted (fewer figures, ring gap).
 */
const LAB_OVERRIDES: Record<string, Partial<Pick<DioramaSquad, "strength" | "cohesion">>> = {
  ford_reavers: { strength: 38, cohesion: 32 },
  greyford_shields: { cohesion: 64 },
};

export const LAB_BOARD = firstBreachScenario.board!;

export const LAB_SQUADS: DioramaSquad[] = firstBreachScenario.squads
  .filter((s) => s.hex)
  .map((s) => ({
    id: s.id,
    faction: s.faction,
    hex: s.hex!,
    strength: s.strength,
    cohesion: s.cohesion,
    facing: s.faction === "free_banners" ? Math.PI : 0,
    ...LAB_OVERRIDES[s.id],
  }));

/** Fog-of-war demo: thick mist over the Host's deployment hexes. */
export const LAB_FOG_DEMO: Record<string, number> = Object.fromEntries(
  LAB_BOARD.hexes
    .filter((h) => h.coord.q <= 1)
    .map((h) => [`${h.coord.q},${h.coord.r}`, 3]),
);
