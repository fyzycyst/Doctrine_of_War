/**
 * The background score (T20): a small generative score in Web Audio, one mood
 * per time of day, so there are no licences to track and no assets to ship.
 * This module is the pure musical logic (keys, progressions, the melody's
 * random walk); the engine voices and schedules it.
 *
 * Each mood is a slow pad over a drone, with a sparse plucked melody walking
 * its scale. Bars are 4 beats; the chord changes each bar.
 */

export type MusicMood = "dusk" | "nightFires" | "rainGrey" | "predawn" | "sunrise";

export interface Mood {
  /** MIDI note of the tonic (the drone sits an octave below). */
  root: number;
  /** Scale degrees as semitones above the root. */
  scale: number[];
  /** Chord roots per bar, as scale-degree indices (0-based), looped. */
  progression: number[];
  bpm: number;
  /** Chance a melody slot sounds (0..1): sparse moods leave room for the drums. */
  density: number;
  /** Pad brightness: low-pass cutoff in Hz. */
  brightness: number;
}

const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const IONIAN = [0, 2, 4, 5, 7, 9, 11];

export const MOODS: Record<MusicMood, Mood> = {
  // Warm, a little wistful: D dorian, i - VII - IV - i.
  dusk: { root: 62, scale: DORIAN, progression: [0, 6, 3, 0], bpm: 64, density: 0.38, brightness: 1300 },
  // Dark and close: A aeolian, i - VI - VII - i, sparse.
  nightFires: { root: 57, scale: AEOLIAN, progression: [0, 5, 6, 0], bpm: 58, density: 0.28, brightness: 900 },
  // Grey and patient: E aeolian, i - iv - VI - v.
  rainGrey: { root: 64, scale: AEOLIAN, progression: [0, 3, 5, 4], bpm: 60, density: 0.3, brightness: 1100 },
  // Held breath: C phrygian, i - II - i - VII.
  predawn: { root: 60, scale: PHRYGIAN, progression: [0, 1, 0, 6], bpm: 54, density: 0.22, brightness: 800 },
  // The turn: D major, I - V - vi - IV, brighter and fuller.
  sunrise: { root: 62, scale: IONIAN, progression: [0, 4, 5, 3], bpm: 72, density: 0.55, brightness: 2200 },
};

export interface MusicNote {
  /** Beat within the bar (0..4, may be fractional). */
  beat: number;
  midi: number;
  /** 0..1 */
  velocity: number;
}

export interface MusicBar {
  /** Pad chord (MIDI), stacked thirds on the bar's degree. */
  chord: number[];
  /** Drone (MIDI): the tonic an octave below the root. */
  drone: number;
  melody: MusicNote[];
}

/** Scale degree `d` (any integer, wraps into octaves) as MIDI above `root`. */
export function degreeToMidi(mood: Mood, d: number): number {
  const n = mood.scale.length;
  const octave = Math.floor(d / n);
  return mood.root + octave * 12 + mood.scale[((d % n) + n) % n];
}

/**
 * Bar `index` of `mood`: the chord for this step of the progression and a
 * melody on eighth-note slots, walking the scale by small steps around the
 * chord (resolving to a chord tone on the downbeat). `rand` makes it
 * deterministic for tests and demos.
 */
export function musicBar(mood: Mood, index: number, rand: () => number, lastDegree = 4): { bar: MusicBar; lastDegree: number } {
  const degree = mood.progression[index % mood.progression.length];
  const chord = [degree, degree + 2, degree + 4].map((d) => degreeToMidi(mood, d) - 12);
  const melody: MusicNote[] = [];
  let walk = lastDegree;
  for (let slot = 0; slot < 8; slot += 1) {
    const downbeat = slot === 0;
    if (!downbeat && rand() > mood.density) continue;
    if (downbeat) {
      // Land on the nearest chord tone.
      const tones = [degree, degree + 2, degree + 4, degree + 7];
      walk = tones.reduce((best, d) => (Math.abs(d - walk) < Math.abs(best - walk) ? d : best), tones[0]);
    } else {
      walk += [-2, -1, -1, 1, 1, 2][Math.floor(rand() * 6)];
      walk = Math.max(degree - 2, Math.min(degree + 9, walk));
    }
    melody.push({ beat: slot / 2, midi: degreeToMidi(mood, walk), velocity: downbeat ? 0.85 : 0.5 + rand() * 0.3 });
  }
  return { bar: { chord, drone: mood.root - 24, melody }, lastDegree: walk };
}

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Music level relative to the master, before the player's music volume. */
export const MUSIC_LEVEL = 0.55;
/** How far SFX duck the music (gain multiplier) and how fast it comes back (s). */
export const DUCK = { depth: 0.4, attack: 0.04, release: 1.4 } as const;
