// Home realms (lore v2, "The realms in this pack"): a company's realm tells the player what
// it is for. UI data until the engine carries a realm on each company; companies with no
// listed home show none.
export type RealmId = "greyford" | "fenwardens" | "dawnwatch";

export const REALMS: Record<RealmId, { name: string; temperament: string }> = {
  greyford: { name: "The Greyford March", temperament: "Holds" },
  fenwardens: { name: "The Fenwardens", temperament: "Withdraws and rescues" },
  dawnwatch: { name: "The Dawnwatch Holds", temperament: "Waits, then strikes" },
};

/** Company id -> home realm (lore v2's proposed homes for the shipped companies, plus the preview Roll). */
export const COMPANY_REALM: Record<string, RealmId> = {
  greyford_shields: "greyford",
  stoneford_riders: "greyford",
  mill_lane_guard: "greyford",
  reedmarsh_levy: "fenwardens",
  dawnwatch_archers: "dawnwatch",
  gatewarden_spears: "dawnwatch",
  hillfort_slingers: "dawnwatch",
  dawnrider_lances: "dawnwatch",
  // The preview Roll (src/app/roll/fixtures.ts).
  cr_ashgate_shields: "greyford",
  cr_causeway_riders: "greyford",
  cr_covenant_standard: "greyford",
  cr_saltgate_pikes: "fenwardens",
  cr_heron_stair_guard: "fenwardens",
  cr_fenmere_bowmen: "fenwardens",
  cr_highwatch_slingers: "dawnwatch",
  cr_dawnward_lances: "dawnwatch",
};

export function realmOf(companyId: string): { id: RealmId; name: string; temperament: string } | null {
  const id = COMPANY_REALM[companyId];
  return id ? { id, ...REALMS[id] } : null;
}
