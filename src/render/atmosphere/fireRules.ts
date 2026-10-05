import type { Anchor } from "../terrain/buildIsland";
import type { TimeOfDay } from "../skins/types";

type FireKind = NonNullable<Anchor["kind"]>;

/**
 * Whether a fire anchor may burn at this hour (the preset's fire intensity still
 * scales it). Ember Ford's burning bridge wrecks and the Host's braziers burn only
 * under nightFires; by day the wrecks are cold, charred stumps (C3, Ember Ford in
 * daylight). Torches, campfires and the Host's fire-pots follow the preset.
 */
export function firesBurn(kind: FireKind, timeOfDay: TimeOfDay): boolean {
  if (kind === "bridge" || kind === "brazier") return timeOfDay === "nightFires";
  return true;
}

/** A cold bridge stump trails a thin smoke by day. */
export function smokesCold(kind: FireKind, timeOfDay: TimeOfDay): boolean {
  return kind === "bridge" && timeOfDay !== "nightFires";
}
