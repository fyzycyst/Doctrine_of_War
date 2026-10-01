import { describe, expect, it } from "vitest";
import { MOODS, motifNotes, musicBar, PART_OCTAVE, type MotifKind, type MusicMood } from "./music";
import { ORCH_PERC, ORCH_TONAL } from "./orchestraManifest";
import { instrumentRange, nearestSample, Orchestra, percLayer, type TonalInstrument } from "./sampler";
import { fold, playScoreBar } from "./score";

/** A minimal fake BaseAudioContext that records what was created. */
function fakeContext() {
  const created: string[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (kind: string) => {
    created.push(kind);
    return {
      gain: param(),
      frequency: param(),
      detune: param(),
      playbackRate: param(),
      Q: param(),
      type: "",
      buffer: null as unknown,
      connect(target: unknown) {
        return target;
      },
      start() {},
      stop() {},
    };
  };
  const ctx = {
    sampleRate: 44100,
    createGain: () => node("gain"),
    createOscillator: () => node("oscillator"),
    createBiquadFilter: () => node("filter"),
    createBufferSource: () => node("bufferSource"),
    decodeAudioData: async () => ({ duration: 6 }) as AudioBuffer,
  } as unknown as BaseAudioContext;
  return { ctx, created };
}

const okFetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch;
const failFetch = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;

describe("orchestra sampler", () => {
  it("maps a pitch to the nearest sample and the rate that reaches it", () => {
    const samples = [
      { midi: 48, file: "a" },
      { midi: 52, file: "b" },
      { midi: 55, file: "c" },
    ];
    expect(nearestSample(samples, 52)).toEqual({ file: "b", rate: 1, shift: 0 });
    const up = nearestSample(samples, 53);
    expect(up.file).toBe("b");
    expect(up.rate).toBeCloseTo(Math.pow(2, 1 / 12));
    // A tie (50 is 2 from 48 and 52) shifts the lower sample up.
    expect(nearestSample(samples, 50).file).toBe("a");
    expect(nearestSample(samples, 60)).toMatchObject({ file: "c", shift: 5 });
  });

  it("keeps every tonal instrument sparsely sampled within a few semitones", () => {
    for (const [name, list] of Object.entries(ORCH_TONAL)) {
      const gaps = list.slice(1).map((s, i) => s.midi - list[i].midi);
      expect(gaps.every((g) => g > 0 && g <= 5), name).toBe(true);
    }
    for (const files of Object.values(ORCH_PERC)) expect(files.length).toBeGreaterThan(0);
  });

  it("picks soft-to-loud percussion layers and alternates neighbours", () => {
    expect(percLayer(5, 0, 0)).toBe(0);
    expect(percLayer(5, 1, 0)).toBe(4);
    expect(percLayer(5, 1, 1)).toBe(3);
    expect(percLayer(5, 0, 1)).toBe(1);
    expect(percLayer(2, 0.9, 1)).toBe(1);
  });

  it("folds every motif and score note into its instrument's sampled range", () => {
    const within = (inst: TonalInstrument, m: number) => {
      const [lo, hi] = instrumentRange(inst);
      return fold(inst, m) >= lo - 4 && fold(inst, m) <= hi + 4;
    };
    const parts: Record<keyof typeof PART_OCTAVE, TonalInstrument[]> = { horns: ["horns"], lowBrass: ["trombones", "tuba"], strings: ["strings"], celli: ["celli"], basses: ["basses"] };
    for (const mood of Object.keys(MOODS) as MusicMood[]) {
      for (const kind of ["banners", "host", "dawn", "victory", "defeat"] as MotifKind[]) {
        for (const n of motifNotes(kind, MOODS[mood])) for (const inst of parts[n.part]) expect(within(inst, n.midi), `${kind} ${n.part} ${n.midi}`).toBe(true);
      }
      const { bar } = musicBar(MOODS[mood], 0, () => 0.3);
      expect(within("celli", bar.chord[0])).toBe(true);
      expect(within("basses", bar.drone)).toBe(true);
      for (const n of bar.melody) expect(within("harp", n.midi)).toBe(true);
    }
  });

  it("falls back to the synth until (or unless) the samples decode", async () => {
    const mood = MOODS.dusk;
    const { bar } = musicBar(mood, 0, () => 0.5);

    // Nothing loaded: the bar is all synth voices.
    const idle = fakeContext();
    const orch = new Orchestra();
    playScoreBar(idle.ctx, {} as AudioNode, orch, mood, bar, 0, 0.5);
    expect(idle.created).not.toContain("bufferSource");
    expect(idle.created).toContain("oscillator");

    // A failed load (e.g. no Ogg Opus decoder) stays on the synth.
    const failed = new Orchestra();
    await failed.load(fakeContext().ctx, "/", failFetch);
    expect(failed.state).toBe("failed");
    expect(failed.has("strings")).toBe(false);
    expect(failed.note(idle.ctx, {} as AudioNode, "harp", 60, 0)).toBe(false);

    // Loaded: the same bar is played on samples, no pad/drone oscillators.
    const loaded = new Orchestra();
    await loaded.load(fakeContext().ctx, "/", okFetch);
    expect(loaded.state).toBe("ready");
    expect(loaded.has("strings") && loaded.has("taiko")).toBe(true);
    const live = fakeContext();
    playScoreBar(live.ctx, {} as AudioNode, loaded, mood, bar, 0, 0.5);
    expect(live.created).toContain("bufferSource");
    expect(live.created).not.toContain("oscillator");
  });
});
