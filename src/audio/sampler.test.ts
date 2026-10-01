import { describe, expect, it } from "vitest";
import { MOODS, MOTIF_PERC, MOTIFS, motifNotes, musicBar, type MotifKind, type MusicMood } from "./music";
import { ORCH_PERC, ORCH_TONAL } from "./orchestraManifest";
import { instrumentRange, nearestSample, Orchestra, percLayer, type TonalInstrument } from "./sampler";
import { fold, PART_INSTRUMENT, playScoreBar } from "./score";

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
      // Short (staccato) notes hide a larger shift than sustains.
      const max = name.endsWith("Stac") ? 7 : 5;
      expect(gaps.every((g) => g > 0 && g <= max), name).toBe(true);
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
    for (const mood of Object.keys(MOODS) as MusicMood[]) {
      for (const kind of Object.keys(MOTIFS) as MotifKind[]) {
        for (const n of motifNotes(kind, MOODS[mood])) for (const inst of PART_INSTRUMENT[n.part]) expect(within(inst, n.midi), `${kind} ${n.part} ${n.midi}`).toBe(true);
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

  it("makes the victory stinger a heraldic fanfare on the Banners' call", () => {
    for (const kind of ["victory", "victoryAlt"] as MotifKind[]) {
      const notes = MOTIFS[kind];
      const end = Math.max(...notes.map((x) => x.at + x.hold));
      expect(end, kind).toBeGreaterThanOrEqual(4);
      expect(end, kind).toBeLessThanOrEqual(6);
      // Triplet pickups: the same short brass note repeated within ~0.12 s.
      const stac = notes.filter((x) => x.part === "trumpetsStac").sort((a, b) => a.at - b.at);
      expect(stac.some((x, i) => i > 0 && x.semis === stac[i - 1].semis && x.at - stac[i - 1].at <= 0.12), kind).toBe(true);
      // It ends on a held major chord in the trumpets: root, third and fifth.
      const lastAt = Math.max(...notes.filter((x) => x.part === "trumpets").map((x) => x.at));
      const final = notes.filter((x) => x.part === "trumpets" && x.at === lastAt);
      expect(new Set(final.map((x) => ((x.semis % 12) + 12) % 12)), kind).toEqual(new Set([0, 4, 7]));
      expect(Math.min(...final.map((x) => x.hold))).toBeGreaterThanOrEqual(1.5);
      // Horns and trombones under it, strings sustaining, and the roll lands on the downbeat with the cymbal.
      for (const part of ["horns", "trombones", "strings"] as const) expect(notes.some((x) => x.part === part && x.at >= lastAt - 0.2), `${kind} ${part}`).toBe(true);
      const roll = MOTIF_PERC[kind].find((h) => h.voice === "timpaniRoll")!;
      expect(roll.at + (roll.duration ?? 0)).toBeCloseTo(lastAt, 1);
      expect(MOTIF_PERC[kind].some((h) => h.voice === "cymbal" && h.at === lastAt)).toBe(true);
    }
    // The head is the Banners' horn call: root, fifth, octave, in that order.
    const longs = MOTIFS.victory.filter((x) => x.part === "trumpets").sort((a, b) => a.at - b.at).slice(0, 2);
    expect([0, ...longs.map((x) => x.semis)]).toEqual([0, 7, 12]);
    expect(MOTIFS.banners.filter((x) => x.semis !== 7 || x.at < 0.9).map((x) => x.semis)).toEqual([0, 7, 12]);
  });
});
