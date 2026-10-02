// Home realms (lore v2, "The realms in this pack"): a company's realm tells the player what
// it is for. UI data until the engine carries a realm on each company; companies with no
// listed home show none.
export type RealmId = "greyford" | "fenwardens" | "dawnwatch";

export const REALMS: Record<RealmId, { name: string; temperament: string }> = {
  greyford: { name: "The Greyford March", temperament: "Holds" },
  fenwardens: { name: "The Fenwardens", temperament: "Withdraws and rescues" },
  dawnwatch: { name: "The Dawnwatch Holds", temperament: "Waits, then strikes" },
};

/** Company id -> home realm (lore v2's homes for the shipped companies). */
export const COMPANY_REALM: Record<string, RealmId> = {
  greyford_shields: "greyford",
  stoneford_riders: "greyford",
  mill_lane_guard: "greyford",
  reedmarsh_levy: "fenwardens",
  dawnwatch_archers: "dawnwatch",
  gatewarden_spears: "dawnwatch",
  hillfort_slingers: "dawnwatch",
  dawnrider_lances: "dawnwatch",
  // Cinder Road (src/game/campaign/cinderRoad.ts, homes per lore v2).
  coldwater_shields: "greyford",
  ferrymoot_pikes: "greyford",
  thornwick_spears: "greyford",
  sedgewick_levy: "fenwardens",
  wickmere_standard: "fenwardens",
  heronwick_bows: "fenwardens",
  sunward_lances: "dawnwatch",
  brightcrag_riders: "dawnwatch",
  morningwall_slingers: "dawnwatch",
};

export function realmOf(companyId: string): { id: RealmId; name: string; temperament: string } | null {
  const id = COMPANY_REALM[companyId];
  return id ? { id, ...REALMS[id] } : null;
}
