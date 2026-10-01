import type { DrumVoice } from "./drums";
import { midiToHz, motifMood, motifNotes, MOODS, type Mood, type MotifKind, type MotifPart, type MusicBar, type MusicMood } from "./music";
import { instrumentRange, type Orchestra, type TonalInstrument } from "./sampler";
import { droneVoice, drumVoice, padVoice, pluckVoice } from "./voices";

/**
 * The score's arrangement (T20b), shared by the live engine and the offline
 * demo: sampled orchestra where loaded (strings and celli pad, contrabass
 * drone, harp melody, horns and low brass motifs, taiko/tenor/snare under the
 * drum ostinato, timpani), each voice falling back to its synth twin.
 */

/** Fold a note into an instrument's sampled range by octaves (shifting at most a few semitones past it). */
export function fold(instrument: TonalInstrument, midi: number): number {
  const [lo, hi] = instrumentRange(instrument);
  let m = midi;
  while (m > hi + 4) m -= 12;
  while (m < lo - 4) m += 12;
  return m;
}

/**
 * One bar of the mood's score at `t`. `intensity` (0..1, the drums' battle
 * intensity) shapes the phrase: a hush in command windows, fuller strings
 * and a busier melody as engagements swell.
 */
export function playScoreBar(ctx: BaseAudioContext, bus: AudioNode, orch: Orchestra | null, mood: Mood, bar: MusicBar, t: number, intensity: number) {
  const beat = 60 / mood.bpm;
  const barLen = beat * 4;
  const swell = 0.55 + 0.45 * intensity;
  const sampled = !!orch && orch.has("strings") && orch.has("celli");
  if (sampled) {
    // Pad: celli take the chord's root, violins the upper tones (and a soft doubling of the top).
    const [root, ...upper] = bar.chord;
    orch!.note(ctx, bus, "celli", fold("celli", root), t, { velocity: 0.55 * swell, duration: barLen, attack: 1.1, release: 1.2, gain: 0.5 });
    for (const m of upper) orch!.note(ctx, bus, "strings", fold("strings", m + 12), t, { velocity: 0.5 * swell, duration: barLen, attack: 1.3, release: 1.2, gain: 0.32 });
  } else {
    padVoice(ctx, bus, bar.chord.map(midiToHz), t, barLen, mood.brightness);
  }
  if (!orch?.note(ctx, bus, "basses", fold("basses", bar.drone), t, { velocity: 0.5, duration: barLen, attack: 1.4, release: 1.2, gain: 0.45 })) {
    droneVoice(ctx, bus, midiToHz(bar.drone), t, barLen);
  }
  for (const note of bar.melody) {
    const at = t + note.beat * beat;
    const v = note.velocity * (0.7 + 0.3 * intensity);
    if (!orch?.note(ctx, bus, "harp", fold("harp", note.midi), at, { velocity: v, duration: 2.2, release: 1.2, gain: 0.55 })) {
      pluckVoice(ctx, bus, midiToHz(note.midi), at, note.velocity);
    }
  }
}

const PART_INSTRUMENT: Record<MotifPart, TonalInstrument[]> = {
  horns: ["horns"],
  lowBrass: ["trombones", "tuba"],
  strings: ["strings"],
  celli: ["celli"],
  basses: ["basses"],
};

/**
 * A motif or stinger at `t` (banners horn call, Host low brass, the dawn
 * swell, victory, defeat), in the current mood's key. With no samples the
 * synth plays the line on plucks and pads so the moment still lands.
 */
export function playMotif(ctx: BaseAudioContext, bus: AudioNode, drumBus: AudioNode, orch: Orchestra | null, kind: MotifKind, current: MusicMood | null, t: number, noise: AudioBuffer | null) {
  const mood = MOODS[motifMood(kind, current)];
  for (const note of motifNotes(kind, mood)) {
    const instruments = PART_INSTRUMENT[note.part];
    let played = false;
    for (const inst of instruments) {
      const attack = note.part === "strings" || note.part === "celli" || note.part === "basses" ? 0.5 : 0.04;
      const gain = inst === "tuba" ? 0.45 : note.part === "horns" ? 0.55 : 0.45;
      played = !!orch?.note(ctx, bus, inst, fold(inst, note.midi), t + note.at, { velocity: note.velocity, duration: note.hold, attack, release: 1, gain }) || played;
    }
    if (!played) {
      if (note.hold > 1.2) padVoice(ctx, bus, [midiToHz(note.midi)], t + note.at, note.hold, 1600, 0.06);
      else pluckVoice(ctx, bus, midiToHz(note.midi), t + note.at, note.velocity, 0.2);
    }
  }
  // Percussion under the big moments.
  if (kind === "host") {
    for (const at of [0, 1, 2, 2.8]) playDrumHit(ctx, drumBus, orch, noise, "low", t + at, 0.95);
    orch?.hit(ctx, drumBus, "timpaniRoll", t + 1.6, 0.8, 0.7);
  }
  if (kind === "dawn" || kind === "victory") {
    orch?.hit(ctx, drumBus, "timpaniRoll", t, 0.6, 0.6);
    orch?.hit(ctx, drumBus, "timpani", t + (kind === "victory" ? 1.05 : 2.4), 1, 0.9);
    orch?.hit(ctx, drumBus, "bassDrum", t + (kind === "victory" ? 1.05 : 2.4), 0.9, 0.7);
  }
  if (kind === "defeat") orch?.hit(ctx, drumBus, "timpani", t + 4.1, 0.25, 0.6);
}

/**
 * One drum-ostinato hit: low → taiko, high → tenor drum, rim → marching snare,
 * with the synth tom kept faintly underneath the samples for weight; synth
 * only until the samples decode.
 */
export function playDrumHit(ctx: BaseAudioContext, dest: AudioNode, orch: Orchestra | null, noise: AudioBuffer | null, voice: DrumVoice, t: number, velocity: number) {
  const sample = voice === "low" ? "taiko" : voice === "high" ? "tenor" : "snare";
  const played = !!orch?.hit(ctx, dest, sample, t, velocity, voice === "rim" ? 0.7 : 1.45);
  if (noise && (!played || voice === "low")) drumVoice(ctx, dest, noise, voice, t, played ? velocity * 0.35 : velocity);
}

/** Timpani with the ostinato: a downbeat hit once the battle is warm, and a roll into big swells. */
export function playDrumBarExtras(ctx: BaseAudioContext, dest: AudioNode, orch: Orchestra | null, t: number, barLen: number, intensity: number, bar: number) {
  if (!orch) return;
  if (intensity > 0.5 && bar % 2 === 0) orch.hit(ctx, dest, "timpani", t, 0.4 + 0.5 * intensity, 0.7);
  if (intensity > 0.85 && bar % 4 === 3) orch.hit(ctx, dest, "timpaniRoll", t + barLen * 0.5, 0.7, 0.55);
}
