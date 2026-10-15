// Seeded PRNG (mulberry32). The engine never calls Math.random; every chance
// roll must come from an Rng threaded in by the caller so a seed reproduces a battle.

export interface Rng {
  /** Uniform float in [0, 1). Advances the state. */
  next(): number;
  /** Current internal state; `createRng(rng.state)` resumes the same stream. */
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state() {
      return a;
    },
  };
}
