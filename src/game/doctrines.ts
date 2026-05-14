import type { Doctrine } from "./types";

export const doctrines: Doctrine[] = [
  {
    id: "shield_the_line",
    faction: "free_banners",
    name: "Shield the Line",
    summary: "Hold formation, protect the gate, and absorb pressure.",
    stance: "defensive",
    targetPriority: "nearest",
    formation: "hold",
    retreatThreshold: "severe",
    pursuit: "none",
    cohesionBias: 8,
    defenseBias: 14,
    counterBias: 0,
  },
  {
    id: "fighting_withdrawal",
    faction: "free_banners",
    name: "Fighting Withdrawal",
    summary: "Yield ground in order to preserve strength and cohesion.",
    stance: "evasive",
    targetPriority: "nearest",
    formation: "withdraw",
    retreatThreshold: "moderate",
    pursuit: "none",
    cohesionBias: 12,
    defenseBias: 4,
    counterBias: -2,
  },
  {
    id: "rescue_standard",
    faction: "free_banners",
    name: "Rescue Standard",
    summary: "Stabilize wounded allies and keep banners standing.",
    stance: "balanced",
    targetPriority: "wounded_allies",
    formation: "support",
    retreatThreshold: "early",
    pursuit: "none",
    cohesionBias: 16,
    defenseBias: 2,
    counterBias: 0,
  },
  {
    id: "clean_counterstroke",
    faction: "free_banners",
    name: "Clean Counterstroke",
    summary: "Hold until the enemy overextends, then strike exposed units.",
    stance: "aggressive",
    targetPriority: "overextended",
    formation: "counterstroke",
    retreatThreshold: "severe",
    pursuit: "short",
    cohesionBias: 0,
    defenseBias: 6,
    counterBias: 14,
  },
  {
    id: "hold_for_dawn",
    faction: "free_banners",
    name: "Hold for Dawn",
    summary: "Conserve strength, refuse panic, and delay the breach.",
    stance: "defensive",
    targetPriority: "objective",
    formation: "hold",
    retreatThreshold: "never",
    pursuit: "none",
    cohesionBias: 14,
    defenseBias: 9,
    counterBias: -1,
  },
  {
    id: "iron_tide",
    faction: "ashen_host",
    name: "Iron Tide",
    summary: "Press the line with steady infantry pressure.",
    stance: "aggressive",
    targetPriority: "objective",
    formation: "hold",
    retreatThreshold: "never",
    pursuit: "short",
    cohesionBias: 0,
    defenseBias: 4,
    counterBias: 8,
  },
  {
    id: "break_the_gate",
    faction: "ashen_host",
    name: "Break the Gate",
    summary: "Drive siege crews into the weakest point.",
    stance: "aggressive",
    targetPriority: "siege",
    formation: "counterstroke",
    retreatThreshold: "never",
    pursuit: "full",
    cohesionBias: -4,
    defenseBias: 2,
    counterBias: 12,
  },
];

export function getDoctrine(doctrineId: string): Doctrine {
  const doctrine = doctrines.find((item) => item.id === doctrineId);

  if (!doctrine) {
    throw new Error(`Unknown doctrine: ${doctrineId}`);
  }

  return doctrine;
}

export const freeBannerDoctrines = doctrines.filter(
  (doctrine) => doctrine.faction === "free_banners",
);

