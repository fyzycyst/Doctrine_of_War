/**
 * The Host's war drums (T20): pure pattern and intensity logic; the audio
 * engine synthesizes the voices and schedules the hits.
 *
 * Martial, not a heartbeat: a low-tom ostinato on a 16-step bar with
 * irregular accents, answered by a higher tom, and a rim/snare layer that
 * only comes in as the battle heats up. Intensity (0..1) sets how many hits
 * play, how hard, and the tempo; it rests at a base level (quiet in command
 * windows) and swells with engagements, dread and the dawn turn.
 */

export type DrumVoice = "low" | "high" | "rim";

export interface DrumHit {
  /** 0..15, sixteenth notes in the bar. */
  step: number;
  voice: DrumVoice;
  /** 0..1 */
  velocity: number;
}

type Row = string; // 16 chars: "X" accent, "x" ghost/normal, "." rest
interface Pattern {
  low: Row;
  high: Row;
  rim: Row;
}

/** Bars cycle through these so the ostinato never settles into a loop you can count. */
export const DRUM_PATTERNS: Pattern[] = [
  { low: "X..x..X.X..x..x.", high: "....x.......x..x", rim: "..x...x...x...x." },
  { low: "X..x..X.X..x.x..", high: "....x......xx...", rim: "..x...x...x.x.x." },
  { low: "X..x..X.X.x..x..", high: "....x...x...x...", rim: "..x...x...x...xx" },
  // A turnaround: rolling low toms into the next bar.
  { low: "X..x..X.X.xxX.xx", high: "....x...x...xx..", rim: "..x.x.x...x.xxxx" },
];

/** Hits an accent ("X") or a normal note ("x") needs before it plays, by voice. */
const THRESHOLD: Record<DrumVoice, { accent: number; normal: number }> = {
  low: { accent: 0, normal: 0.25 },
  high: { accent: 0.2, normal: 0.45 },
  rim: { accent: 0.55, normal: 0.7 },
};

/**
 * The hits of bar `index` at `intensity`. Low intensity keeps only the low-tom
 * accents (a slow, distant pulse); more intensity adds the answering tom, the
 * ghost notes, then the rim layer, and every fourth bar is the turnaround.
 */
export function drumBar(intensity: number, index: number): DrumHit[] {
  const k = clamp01(intensity);
  const pattern = DRUM_PATTERNS[index % 4 === 3 && k > 0.5 ? 3 : index % 3];
  const hits: DrumHit[] = [];
  for (const voice of ["low", "high", "rim"] as const) {
    const row = pattern[voice];
    for (let step = 0; step < 16; step += 1) {
      const c = row[step];
      if (c === ".") continue;
      const accent = c === "X";
      if (k < (accent ? THRESHOLD[voice].accent : THRESHOLD[voice].normal)) continue;
      const base = accent ? 1 : voice === "low" ? 0.62 : 0.5;
      hits.push({ step, voice, velocity: base * (0.55 + 0.45 * k) });
    }
  }
  return hits;
}

/** Beats per minute at an intensity: a slow march when calm, quickening into battle. */
export function drumTempo(intensity: number): number {
  return 78 + 26 * clamp01(intensity);
}

/**
 * Battle intensity: a base level plus decaying swells. `value(t)` is the
 * larger of the base and the strongest swell still ringing at time `t`.
 */
export class DrumIntensity {
  private swells: Array<{ level: number; start: number; hold: number; decay: number }> = [];
  constructor(public base: number = DRUM_BASE.command) {}

  setBase(level: number) {
    this.base = clamp01(level);
  }

  /** Swell to `level`, hold for `hold` s, then fall back over `decay` s. */
  swell(level: number, t: number, hold = 2, decay = 5) {
    this.swells.push({ level: clamp01(level), start: t, hold, decay });
    if (this.swells.length > 8) this.swells.shift();
  }

  value(t: number): number {
    let v = this.base;
    this.swells = this.swells.filter((s) => t - s.start < s.hold + s.decay);
    for (const s of this.swells) {
      const age = t - s.start;
      const fall = age <= s.hold ? 1 : 1 - (age - s.hold) / s.decay;
      v = Math.max(v, s.level * Math.max(0, fall));
    }
    return v;
  }
}

/** Base levels for the battle's moments (callers pick one with `setDrumIntensity`). */
export const DRUM_BASE = { command: 0.22, playback: 0.45 } as const;

/** How hard each SFX moment pushes the drums: [level, hold s, decay s]. */
export const DRUM_SWELLS: Partial<Record<string, [number, number, number]>> = {
  clash: [0.78, 2.5, 5],
  rout: [0.7, 1.5, 4],
  horn: [0.85, 2, 5],
  dread: [1, 3, 6],
  reveal: [0.55, 1, 3],
  dawn: [1, 4, 7],
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
