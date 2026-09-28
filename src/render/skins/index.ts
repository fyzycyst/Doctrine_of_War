import { emberDusk } from "./emberDusk";
import { illuminatedChronicle } from "./illuminatedChronicle";
import type { Skin, TimeOfDay } from "./types";
import { TIME_OF_DAY_KEYS } from "./types";

export * from "./types";
export { emberDusk } from "./emberDusk";

export const SKINS: Record<string, Skin> = {
  emberDusk,
  illuminatedChronicle,
};

export const DEFAULT_SKIN_ID = "emberDusk";

export function getSkin(id: string | null | undefined): Skin {
  return (id && SKINS[id]) || SKINS[DEFAULT_SKIN_ID];
}

export function isTimeOfDay(value: string | null | undefined): value is TimeOfDay {
  return !!value && (TIME_OF_DAY_KEYS as string[]).includes(value);
}
