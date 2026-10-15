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

// --- Motifs and stingers (T20b) ------------------------------------------------

export type MotifKind = "banners" | "host" | "dawn" | "victory" | "victoryAlt" | "defeat";
/** Sustained parts, and (T20c) trumpets plus short "Stac" brass for fanfare pickups. */
export type MotifPart = "horns" | "lowBrass" | "strings" | "celli" | "basses" | "trumpets" | "trumpetsStac" | "hornsStac" | "trombones" | "tromboneStac";

export interface MotifNote {
  part: MotifPart;
  /** Seconds from the motif's start. */
  at: number;
  /** Semitones from the mood's root (the part's octave is applied by `motifNotes`). */
  semis: number;
  /** Seconds held before the release. */
  hold: number;
  velocity: number;
}

/** Each part's octave offset from the mood root (MIDI semitones), to land in its sampled range. */
export const PART_OCTAVE: Record<MotifPart, number> = {
  horns: -12,
  lowBrass: -24,
  strings: 0,
  celli: -12,
  basses: -24,
  trumpets: 0,
  trumpetsStac: 0,
  hornsStac: -12,
  trombones: -12,
  tromboneStac: -12,
};

const n = (part: MotifPart, at: number, semis: number, hold: number, velocity: number): MotifNote => ({ part, at, semis, hold, velocity });

/** A chord of `semis` for one part, all starting at `at`. */
const chord = (part: MotifPart, at: number, semis: number[], hold: number, velocity: number) => semis.map((x) => n(part, at, x, hold, velocity));

/**
 * The victory fanfare (T20c), about 5 s in D major (the sunrise key):
 * - head: the Banners' call as a fanfare, "ta-ta-TAAA" (a triplet pickup on the
 *   root, then the fifth) and the octave, horns a fifth/octave below;
 * - answer: "ta-ta-TA-ti-TAAA", dotted, rising third, fifth, sixth into
 * - the final held D major chord: trumpets, horns and trombones in close
 *   harmony, tuba and strings underneath. The timpani roll into it and the
 *   downbeat lands with timpani, bass drum and cymbal (VICTORY_PERC).
 */
const VICTORY: MotifNote[] = [
  // Head: ta-ta-TAAA (root, root, fifth), then the octave.
  n("trumpetsStac", 0, 0, 0.08, 0.85),
  n("trumpetsStac", 0.11, 0, 0.08, 0.85),
  n("trumpets", 0.22, 7, 0.4, 0.95),
  n("hornsStac", 0, 0, 0.08, 0.75),
  n("hornsStac", 0.11, 0, 0.08, 0.75),
  n("horns", 0.22, 12, 0.4, 0.85),
  n("trumpets", 0.72, 12, 0.55, 1),
  n("horns", 0.72, 12, 0.55, 0.85),
  n("trombones", 0.72, 0, 0.55, 0.8),
  // Answer: ta-ta (third) TA (fifth, dotted) ti (sixth)...
  n("trumpetsStac", 1.4, 4, 0.08, 0.85),
  n("trumpetsStac", 1.51, 4, 0.08, 0.85),
  n("trumpets", 1.62, 7, 0.22, 0.95),
  n("trumpetsStac", 1.9, 9, 0.08, 0.9),
  n("hornsStac", 1.4, 12, 0.08, 0.75),
  n("hornsStac", 1.51, 12, 0.08, 0.75),
  n("horns", 1.62, 4, 0.22, 0.8),
  n("hornsStac", 1.9, 7, 0.08, 0.8),
  n("tromboneStac", 1.4, 0, 0.08, 0.75),
  n("tromboneStac", 1.62, 0, 0.2, 0.8),
  // ...TAAA: the held D major chord.
  ...chord("trumpets", 2.02, [7, 12, 16], 2.4, 1),
  ...chord("horns", 2.02, [4, 7, 12], 2.4, 0.75),
  ...chord("trombones", 2.02, [-5, 0], 2.4, 0.8),
  n("lowBrass", 2.02, 0, 2.4, 0.8),
  ...chord("strings", 1.9, [12, 16, 19], 2.6, 0.6),
  n("celli", 1.9, 0, 2.6, 0.8),
  n("basses", 2.02, 0, 2.4, 0.8),
];

/** The alternative: a herald's antiphon, trumpets call, horns and trombones answer, then IV-I tutti. */
const VICTORY_ALT: MotifNote[] = [
  // Trumpets: ta-ta-ta TA ti TAAA (D5 D5 D5, A4 dotted, B4, D5).
  n("trumpetsStac", 0, 12, 0.08, 0.85),
  n("trumpetsStac", 0.1, 12, 0.08, 0.85),
  n("trumpetsStac", 0.2, 12, 0.08, 0.85),
  n("trumpets", 0.3, 7, 0.3, 0.9),
  n("trumpetsStac", 0.66, 9, 0.08, 0.85),
  n("trumpets", 0.78, 12, 0.55, 1),
  // Horns and trombones answer a fourth below.
  ...[1.5, 1.6, 1.7].flatMap((at) => [n("hornsStac", at, 7, 0.08, 0.8), n("tromboneStac", at, -5, 0.08, 0.75)]),
  n("horns", 1.8, 4, 0.3, 0.85),
  n("trombones", 1.8, -8, 0.3, 0.8),
  n("hornsStac", 2.16, 2, 0.08, 0.8),
  n("horns", 2.28, 7, 0.55, 0.9),
  n("trombones", 2.28, -5, 0.55, 0.85),
  // Tutti: a triplet pickup, the IV chord, then I held.
  ...[3.0, 3.1, 3.2].map((at) => n("trumpetsStac", at, 7, 0.08, 0.9)),
  ...chord("trumpets", 3.3, [5, 9, 12], 0.42, 0.95),
  ...chord("horns", 3.3, [5, 9], 0.42, 0.85),
  n("trombones", 3.3, -7, 0.42, 0.85),
  ...chord("trumpets", 3.78, [7, 12, 16], 1.7, 1),
  ...chord("horns", 3.78, [4, 7, 12], 1.7, 0.75),
  ...chord("trombones", 3.78, [-5, 0], 1.7, 0.8),
  n("lowBrass", 3.78, 0, 1.7, 0.8),
  ...chord("strings", 3.7, [12, 16, 19], 1.9, 0.6),
  n("celli", 3.7, 0, 1.9, 0.8),
  n("basses", 3.78, 0, 1.7, 0.8),
];

export type MotifPerc = "timpani" | "timpaniRoll" | "bassDrum" | "cymbal" | "drumLow";
export interface MotifHit {
  at: number;
  voice: MotifPerc;
  velocity: number;
  /** Cut a long sample (a roll) after this many seconds. */
  duration?: number;
  /** Overrides the voice's default level in motifs. */
  gain?: number;
}

/** Percussion under each motif. */
export const MOTIF_PERC: Record<MotifKind, MotifHit[]> = {
  banners: [],
  host: [
    ...[0, 1, 2, 2.8].map((at): MotifHit => ({ at, voice: "drumLow", velocity: 0.95 })),
    { at: 1.6, voice: "timpaniRoll", velocity: 0.8, gain: 0.7 },
  ],
  dawn: [
    { at: 0, voice: "timpaniRoll", velocity: 0.6, gain: 0.6 },
    { at: 2.4, voice: "timpani", velocity: 1, gain: 0.9 },
    { at: 2.4, voice: "bassDrum", velocity: 0.9, gain: 0.7 },
  ],
  victory: [
    { at: 0.22, voice: "timpani", velocity: 0.6 },
    { at: 0.72, voice: "timpani", velocity: 0.75 },
    { at: 1.36, voice: "timpaniRoll", velocity: 0.8, duration: 0.68 },
    { at: 2.02, voice: "timpani", velocity: 1 },
    { at: 2.02, voice: "bassDrum", velocity: 0.95 },
    { at: 2.02, voice: "cymbal", velocity: 0.9 },
  ],
  victoryAlt: [
    { at: 0.78, voice: "timpani", velocity: 0.6 },
    { at: 2.28, voice: "timpani", velocity: 0.65 },
    { at: 3.0, voice: "timpaniRoll", velocity: 0.8, duration: 0.78 },
    { at: 3.78, voice: "timpani", velocity: 1 },
    { at: 3.78, voice: "bassDrum", velocity: 0.95 },
    { at: 3.78, voice: "cymbal", velocity: 0.95 },
  ],
  defeat: [{ at: 4.1, voice: "timpani", velocity: 0.25, gain: 0.6 }],
};

/**
 * - banners: the Free Banners' horn call (root, fifth, octave), on rallies and charges;
 * - host: low brass grinding a half-step and falling a fourth, on dread (drums underneath);
 * - dawn: the sunrise turn, strings swelling on the major chord under a rising horn line;
 * - victory: a heraldic fanfare whose head is the Banners' call (see VICTORY below);
 * - victoryAlt: a herald's antiphon, trumpets calling and horns answering, then I-IV-I tutti;
 * - defeat: a sparse low cello line falling over a held bass.
 */
export const MOTIFS: Record<MotifKind, MotifNote[]> = {
  banners: [n("horns", 0, 0, 0.35, 0.8), n("horns", 0.45, 7, 0.35, 0.85), n("horns", 0.9, 12, 1.6, 0.95), n("horns", 0.9, 7, 1.6, 0.7)],
  host: [
    n("lowBrass", 0, 0, 0.9, 0.9),
    n("lowBrass", 1.0, 1, 0.9, 0.9),
    n("lowBrass", 2.0, 0, 0.7, 0.85),
    n("lowBrass", 2.8, -5, 2.0, 1),
    n("basses", 0, 0, 4.5, 0.7),
  ],
  dawn: [
    n("strings", 0, 0, 3.4, 0.7),
    n("strings", 0, 4, 3.4, 0.7),
    n("strings", 0, 7, 3.4, 0.7),
    n("celli", 0, 0, 3.4, 0.75),
    n("basses", 0, 0, 3.4, 0.7),
    n("horns", 0.6, 0, 0.6, 0.75),
    n("horns", 1.2, 4, 0.6, 0.8),
    n("horns", 1.8, 7, 0.6, 0.85),
    n("horns", 2.4, 12, 1.8, 0.95),
  ],
  victory: VICTORY,
  victoryAlt: VICTORY_ALT,
  defeat: [
    n("basses", 0, 0, 5, 0.55),
    n("celli", 0.2, 3, 1.4, 0.6),
    n("celli", 1.7, 1, 1.2, 0.55),
    n("celli", 3.0, 0, 1.0, 0.5),
    n("celli", 4.1, -2, 2.4, 0.45),
  ],
};

/** A motif's notes as MIDI for a mood's key: semitones over the root, in the part's octave. */
export function motifNotes(kind: MotifKind, mood: Mood): Array<MotifNote & { midi: number }> {
  return MOTIFS[kind].map((note) => ({ ...note, midi: mood.root + PART_OCTAVE[note.part] + note.semis }));
}

/** Which mood's key a motif speaks in (dawn and victory always in the sunrise major). */
export function motifMood(kind: MotifKind, current: MusicMood | null): MusicMood {
  if (kind === "dawn" || kind === "victory" || kind === "victoryAlt") return "sunrise";
  if (kind === "defeat") return "nightFires";
  return current ?? "dusk";
}
