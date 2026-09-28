// Shared primitive types used by the board and the doctrine engine. (The lane-era
// scenario, doctrine and battle types that used to live here were removed with
// the legacy resolver; the engine's schema is in src/game/engine/types.ts.)

export type FactionId = "ashen_host" | "free_banners";

export type SquadRole = "frontline" | "skirmish" | "support" | "siege" | "cavalry";
