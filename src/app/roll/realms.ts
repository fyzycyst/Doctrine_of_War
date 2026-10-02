// Home realms (lore v2, "The realms in this pack"): a company's realm tells the player what
// it is for. The engine carries the realm on each company (M1); this file only words it.
import type { RealmId } from "../../game/campaign";
import { packs } from "./api";

export const REALMS: Record<RealmId, { name: string; temperament: string }> = {
  greyford_march: { name: "The Greyford March", temperament: "Holds" },
  fenwardens: { name: "The Fenwardens", temperament: "Withdraws and rescues" },
  dawnwatch_holds: { name: "The Dawnwatch Holds", temperament: "Waits, then strikes" },
};

/**
 * A company's home realm: its own (Roll campaigns and carried companies carry one), else
 * the one its campaign's definition gives it (the intro's fixed companies). None when neither says.
 */
export function realmOf(company: { id: string; realm?: RealmId }): { id: RealmId; name: string; temperament: string } | null {
  const id =
    company.realm ??
    packs()
      .packs.flatMap((pack) => pack.campaigns)
      .flatMap((def) => def.companies)
      .find((item) => item.id === company.id)?.realm;
  return id ? { id, ...REALMS[id] } : null;
}
