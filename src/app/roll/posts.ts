// What a Call the Banners post is called (M1 design notes): a position on the field, never
// the name of the scenario's authored squad (a company of its own, on a borrowed board).
import { getHex, hexKey, type HexCoord } from "../../game/board";
import type { CampaignBattle, RollSlot } from "../../game/campaign";
import type { EngineScenario } from "../../game/engine";

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

/** Where a post stands on the board. */
export function postHex(scenario: EngineScenario, slotId: string): HexCoord | null {
  return scenario.squads.find((squad) => squad.id === slotId)?.hex ?? null;
}

/**
 * Each post's name: an authored position name (`call.labels`, when the battle has them), else
 * the hex's own label ("North Ridge"), else its ground ("Field post"). Names that would repeat
 * are numbered in activation order.
 */
export function postNames(battle: CampaignBattle, scenario: EngineScenario, slots: RollSlot[]): Record<string, string> {
  const authored = (battle.call as { labels?: Record<string, string> } | undefined)?.labels ?? {};
  const base = slots.map((slot) => {
    if (authored[slot.slotId]) return authored[slot.slotId];
    const hex = postHex(scenario, slot.slotId);
    const boardHex = hex ? getHex(scenario.board, hex) : undefined;
    if (boardHex?.label) return boardHex.label;
    return boardHex ? `${capital(boardHex.terrain)} post` : "A post";
  });
  const names: Record<string, string> = {};
  slots.forEach((slot, index) => {
    const repeats = base.filter((name) => name === base[index]).length > 1;
    names[slot.slotId] = repeats ? `${base[index]} ${base.slice(0, index + 1).filter((name) => name === base[index]).length}` : base[index];
  });
  return names;
}

export const postKey = (scenario: EngineScenario, slotId: string) => {
  const hex = postHex(scenario, slotId);
  return hex ? hexKey(hex) : slotId;
};
