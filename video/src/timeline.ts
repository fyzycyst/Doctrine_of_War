// The edit's timeline, from the script (script.ts) and what is on disk (media.json, written
// by `npm run prepare-media`). Pure, so the compositions, the SRT writer and the tests agree.
import { INTRO, SHOTS, type Shot, type ShotId, type Stem } from "./script";

export const FPS = 30;
/** Silence before a VO line starts in its shot, and after it ends before the cut. */
export const VO_LEAD = 0.5;
export const VO_TAIL = 0.8;
/** The end card lands before the Chronicler speaks over it. */
const END_LEAD = 1.0;
/** The shortest a shot with a VO take runs, unless the script sets its own floor (`min`). */
export const MIN_SHOT = 5;

export interface MediaFile {
  /** Relative to the public dir (staticFile). */
  file: string;
  seconds: number;
  /** Integrated loudness (LUFS), measured for VO takes and music stems: the mix levels them. */
  lufs?: number;
}

export interface Media {
  vo: Record<string, MediaFile & { source: "final" | "temp" }>;
  /** A shot's clip; a montage may also have its parts (s08a-…, s08b-…), which the edit cuts itself. */
  clips: Partial<Record<ShotId, MediaFile & { focalX: number; parts?: Array<MediaFile & { focalX: number }> }>>;
  stills: Partial<Record<ShotId, Array<{ file: string; focalX: number; focalY: number }>>>;
  music: Partial<Record<Stem, MediaFile>>;
  /** The user's intro (intro/intro.mp4|mov|m4v): its own picture and sound, in the slot after the cold open. */
  intro?: MediaFile & {
    width: number;
    height: number;
    /** Its sound, levelled to the narration (absent: a silent clip). */
    audio?: string;
    /** From intro.srt beside it, in seconds from the intro's start. */
    captions?: Array<{ from: number; to: number; text: string }>;
  };
}

export interface Segment {
  kind: "shot" | "intro";
  id: string;
  shot: Shot | null;
  /** Start and length, in frames. */
  from: number;
  frames: number;
  /** The user's intro clip, for the intro slot when one exists (else the placeholder card). */
  intro?: NonNullable<Media["intro"]>;
  /** The VO line laid in this shot (absolute frames), if it has one and a take exists. */
  vo: null | { id: string; text: string; file: string; source: "final" | "temp"; lufs?: number; from: number; frames: number };
}

export interface Timeline {
  segments: Segment[];
  frames: number;
}

export const toFrames = (seconds: number) => Math.round(seconds * FPS);

export function buildTimeline(media: Media, options: { intro: boolean }): Timeline {
  const segments: Segment[] = [];
  let at = 0;
  for (const shot of SHOTS) {
    const take = shot.vo ? media.vo[shot.vo.id] : undefined;
    const lead = shot.layout === "end" ? END_LEAD : VO_LEAD;
    // With a take, a shot runs as long as its line needs (no dead air), down to its floor;
    // without one, §0.2's target.
    const seconds = take ? Math.max(shot.min ?? MIN_SHOT, lead + take.seconds + VO_TAIL) : shot.target;
    const frames = toFrames(seconds);
    segments.push({
      kind: "shot",
      id: shot.id,
      shot,
      from: at,
      frames,
      vo: shot.vo && take ? { id: shot.vo.id, text: shot.vo.text, file: take.file, source: take.source, lufs: take.lufs, from: at + toFrames(lead), frames: Math.ceil(take.seconds * FPS) } : null,
    });
    at += frames;
    // The intro slot: the user's clip at its own length, or the placeholder card.
    if (options.intro && shot.id === INTRO.after) {
      const intro = media.intro ? Math.round(media.intro.seconds * FPS) : toFrames(INTRO.placeholderSeconds);
      segments.push({ kind: "intro", id: "intro", shot: null, from: at, frames: intro, vo: null, ...(media.intro ? { intro: media.intro } : {}) });
      at += intro;
    }
  }
  return { segments, frames: at };
}

/** Frames where the Chronicler is speaking (the music ducks under them). */
export function voWindows(timeline: Timeline): Array<[number, number]> {
  return timeline.segments.flatMap((segment) => (segment.vo ? [[segment.vo.from, segment.vo.from + segment.vo.frames] as [number, number]] : []));
}

/** Where a stem starts when it comes back later in the cut: past its opening (music/README.txt's loop points). */
const RETURN_AT: Partial<Record<Stem, number>> = { battle: 3.85, dusk: 11.35 };

export interface Bed {
  stem: Stem;
  from: number;
  frames: number;
  /** Seconds into the stem where this bed starts. */
  start: number;
  /** Silence follows (the user's intro, with its own sound): the bed fades out in place rather than into the next. */
  gapAfter?: boolean;
}

/**
 * The score's beds: consecutive shots on the same stem make one bed. The placeholder intro card
 * keeps the bed it falls in; the user's intro clip has no music under it: the bed before it
 * fades out at its end, and the one after picks the stem up where it left off.
 */
export function musicBeds(timeline: Timeline): Bed[] {
  const beds: Bed[] = [];
  let resumeAfterGap = false;
  for (const segment of timeline.segments) {
    if (segment.intro) {
      const last = beds.at(-1);
      if (last) last.gapAfter = true;
      resumeAfterGap = true;
      continue;
    }
    const stem = segment.shot?.stem ?? beds.at(-1)?.stem;
    if (!stem) continue;
    const last = beds.at(-1);
    if (last && last.stem === stem && !last.gapAfter) last.frames += segment.frames;
    else {
      const before = [...beds].reverse().find((bed) => bed.stem === stem);
      // Back after the intro: carry on from where the stem stopped. Back after other music: past its opening.
      const start = !before ? 0 : resumeAfterGap && before === last ? before.start + before.frames / FPS : (RETURN_AT[stem] ?? 0);
      beds.push({ stem, from: segment.from, frames: segment.frames, start });
    }
    resumeAfterGap = false;
  }
  return beds;
}
