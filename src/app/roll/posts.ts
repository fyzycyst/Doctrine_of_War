// What a Call the Banners post is called (M1 design notes): the engine's position name
// (`RollSlot.label`: authored, else the hex's label, else its ground and role), never the
// name of the scenario's authored squad. Here only names that would repeat are numbered.
import type { RollSlot } from "../../game/campaign";

/** Each post's name, numbered in activation order where two posts share one. */
export function postNames(slots: RollSlot[]): Record<string, string> {
  const names: Record<string, string> = {};
  slots.forEach((slot, index) => {
    const same = slots.filter((other) => other.label === slot.label);
    names[slot.slotId] = same.length > 1 ? `${slot.label} ${slots.slice(0, index + 1).filter((other) => other.label === slot.label).length}` : slot.label;
  });
  return names;
}
