import { ORCH_PERC, ORCH_TONAL } from "./orchestraManifest";

/**
 * The score's sampled orchestra (T20b): VSCO 2 Community Edition, CC0 (see
 * CREDITS.md and scripts/build-orchestra.mjs). Sparse sampling: each tonal
 * instrument has a note every 3–4 semitones and the nearest one is
 * pitch-shifted; percussion has a few dynamic layers.
 *
 * Loading is lazy (the engine starts it after the first interaction) and
 * per-instrument: until an instrument has decoded, or if loading fails, `has()`
 * is false and callers use the synth voices instead.
 */

export type TonalInstrument = keyof typeof ORCH_TONAL;
export type PercVoice = keyof typeof ORCH_PERC;

export interface SampleChoice {
  file: string;
  /** Playback rate that shifts the sample to the wanted pitch. */
  rate: number;
  /** Semitones of shift (for keeping it small). */
  shift: number;
}

/** The nearest sampled note to `midi` and the rate that shifts it there. */
export function nearestSample(samples: ReadonlyArray<{ midi: number; file: string }>, midi: number): SampleChoice {
  let best = samples[0];
  for (const s of samples) {
    const d = Math.abs(s.midi - midi);
    const bestD = Math.abs(best.midi - midi);
    // On a tie prefer shifting a lower sample up (brighter, less "slowed" artefacting).
    if (d < bestD || (d === bestD && s.midi < best.midi)) best = s;
  }
  const shift = midi - best.midi;
  return { file: best.file, rate: Math.pow(2, shift / 12), shift };
}

/** A percussion layer for a velocity (0..1): soft → loud files, alternating neighbours for round-robin. */
export function percLayer(count: number, velocity: number, roundRobin: number): number {
  const v = Math.max(0, Math.min(1, velocity));
  const base = Math.min(count - 1, Math.floor(v * count));
  if (count < 3 || roundRobin % 2 === 0) return base;
  return base > 0 ? base - 1 : base + 1;
}

/** Instrument ranges (sampled MIDI min..max), for clamping and octave folding. */
export function instrumentRange(instrument: TonalInstrument): [number, number] {
  const list = ORCH_TONAL[instrument];
  return [list[0].midi, list[list.length - 1].midi];
}

/**
 * Sampled notes are normalized to -1 dBFS each; this brings them to the synth
 * voices' level so the mix (and the synth fallback) stays balanced.
 */
export const ORCH_TONAL_GAIN = 0.7;

export interface NoteOptions {
  velocity?: number;
  /** Seconds the note holds before its release. */
  duration?: number;
  /** Swell-in time (0 = struck). */
  attack?: number;
  release?: number;
  /** Extra gain (linear). */
  gain?: number;
}

export class Orchestra {
  private buffers = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private rr = 0;
  state: "idle" | "loading" | "ready" | "failed" = "idle";

  /** True once every sample of `instrument` has decoded. */
  has(instrument: TonalInstrument | PercVoice): boolean {
    const files: ReadonlyArray<string> =
      instrument in ORCH_TONAL ? ORCH_TONAL[instrument as TonalInstrument].map((s) => s.file) : ORCH_PERC[instrument as PercVoice];
    return files.every((f) => this.buffers.has(f));
  }

  /**
   * Fetch and decode every sample (same-origin, `${base}assets/audio/orch/`).
   * Failures leave that sample missing (its instrument stays on the synth).
   */
  load(ctx: BaseAudioContext, base: string, fetcher: typeof fetch = fetch): Promise<void> {
    if (this.loading) return this.loading;
    this.state = "loading";
    const files = [...Object.values(ORCH_TONAL).flatMap((list) => list.map((s) => s.file)), ...Object.values(ORCH_PERC).flat()];
    this.loading = Promise.all(
      files.map(async (file) => {
        try {
          const res = await fetcher(`${base}assets/audio/orch/${file}`);
          if (!res.ok) throw new Error(String(res.status));
          this.buffers.set(file, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // Missing or undecodable (e.g. a browser without Ogg Opus): synth fallback.
        }
      }),
    ).then(() => {
      this.state = this.buffers.size > 0 ? "ready" : "failed";
    });
    return this.loading;
  }

  /** Play a tonal note; false (and silent) if the instrument isn't loaded. */
  note(ctx: BaseAudioContext, dest: AudioNode, instrument: TonalInstrument, midi: number, t: number, opts: NoteOptions = {}): boolean {
    if (!this.has(instrument)) return false;
    const choice = nearestSample(ORCH_TONAL[instrument], midi);
    const buffer = this.buffers.get(choice.file)!;
    const { velocity = 0.8, duration = 1, attack = 0.02, release = 0.8, gain = 1 } = opts;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = choice.rate;
    // The sample's real length after the pitch shift bounds hold + release.
    const length = buffer.duration / choice.rate;
    const rel = Math.min(release, Math.max(0.2, length * 0.3));
    const hold = Math.max(0.05, Math.min(duration, length - rel - 0.05));
    const level = ORCH_TONAL_GAIN * gain * (0.35 + 0.65 * velocity);
    const g = ctx.createGain();
    g.gain.setValueAtTime(attack > 0.03 ? 0.0001 : level, t);
    if (attack > 0.03) g.gain.linearRampToValueAtTime(level, t + Math.min(attack, hold));
    g.gain.setValueAtTime(level, t + hold);
    g.gain.linearRampToValueAtTime(0.0001, t + hold + rel);
    src.connect(g).connect(dest);
    src.start(t);
    src.stop(t + hold + rel + 0.05);
    return true;
  }

  /** Play a percussion hit; false if the voice isn't loaded. */
  hit(ctx: BaseAudioContext, dest: AudioNode, voice: PercVoice, t: number, velocity: number, gain = 1, duration?: number): boolean {
    if (!this.has(voice)) return false;
    const files = ORCH_PERC[voice];
    const file = files[percLayer(files.length, velocity, this.rr++)];
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.get(file)!;
    // A hair of detune per hit so repeats don't machine-gun.
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.03;
    const g = ctx.createGain();
    const level = gain * (0.45 + 0.55 * velocity);
    g.gain.setValueAtTime(level, t);
    src.connect(g).connect(dest);
    src.start(t);
    if (duration !== undefined) {
      // Cut a long sample (a timpani roll into a downbeat) with a short fade.
      g.gain.setValueAtTime(level, t + duration);
      g.gain.linearRampToValueAtTime(0.0001, t + duration + 0.08);
      src.stop(t + duration + 0.1);
    }
    return true;
  }
}
