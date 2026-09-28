import { mulberry32 } from "./hexWorld";

/**
 * Tech plan D7: a squad is a cluster of figures; figures fall as strength drops.
 * A full-strength squad shows `max` figures; any living squad shows at least one.
 */
export function figureCount(strength: number, max = 9): number {
  if (strength <= 0) return 0;
  return Math.max(1, Math.min(max, Math.ceil((strength / 100) * max)));
}

export interface FigureSlot {
  /** Offset from the squad centre in the squad's local frame (+x = facing). */
  forward: number;
  side: number;
  /** Small per-figure yaw jitter in radians. */
  yaw: number;
  /** Idle-animation phase in [0, 2π). */
  phase: number;
}

/**
 * All nine slots of a loose 3×3 block, ordered by survival: index 0 is the last
 * figure to fall, index 8 the first. Which slots go first is seeded, so a
 * depleted squad looks ragged rather than simply missing its back rank, and the
 * order is stable so animations (`fall`) and strength updates agree.
 */
export function formationOrder(seed: number, spacing = 0.24): FigureSlot[] {
  const rand = mulberry32(seed);
  const all: FigureSlot[] = [];
  for (let rank = 0; rank < 3; rank += 1) {
    for (let file = 0; file < 3; file += 1) {
      const stagger = rank % 2 === 1 ? spacing * 0.5 : 0;
      all.push({
        forward: (1 - rank) * spacing * 0.95 + (rand() - 0.5) * spacing * 0.25,
        side: (file - 1) * spacing + stagger - spacing * 0.25 + (rand() - 0.5) * spacing * 0.25,
        yaw: (rand() - 0.5) * 0.5,
        phase: rand() * Math.PI * 2,
      });
    }
  }
  // Fisher–Yates with the same seeded generator gives the drop order.
  const order = all.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.reverse().map((index) => all[index]);
}

/** The `count` surviving slots (a prefix of `formationOrder`). */
export function formationSlots(count: number, seed: number, spacing = 0.24): FigureSlot[] {
  return formationOrder(seed, spacing).slice(0, Math.max(0, Math.min(9, count)));
}

/** Cohesion ring arc: the lit fraction of the ring and the size of the gap. */
export function cohesionArc(cohesion: number): { lit: number; gap: number } {
  const lit = Math.max(0, Math.min(1, cohesion / 100));
  return { lit, gap: 1 - lit };
}
