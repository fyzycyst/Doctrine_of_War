// Captions (SRT) for the Chronicler's lines, timed from the timeline (the real VO lengths),
// and for the user's intro when an intro.srt came with it (offset to where the intro sits).
// A line is cut into cues at its sentences, then at commas, so each cue fits two lines;
// a cue's share of the line's time follows its length.
import { FPS, type Timeline } from "./timeline";

export interface Cue {
  from: number;
  to: number;
  text: string;
}

/** 16:9 and 9:16 differ only in how long a caption line may be. */
export const LINE_LENGTH = { main: 42, vertical: 28 } as const;

/** Greedy word wrap. */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** `text` cut at words into the fewest pieces that each fit, as even in length as can be. */
function balanced(text: string, max: number, fits: (piece: string) => boolean): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  for (let count = 2; count <= words.length; count += 1) {
    const target = text.length / count;
    const pieces: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      // Close the piece once it reaches its share, keeping room for the pieces still to come.
      if (current && next.length > target && pieces.length < count - 1) {
        pieces.push(current);
        current = word;
      } else current = next;
    }
    pieces.push(current);
    if (pieces.every(fits)) return pieces;
  }
  return words;
}

/** Pieces of `text` that each wrap to at most two lines: sentences, then clauses, then words. */
export function chunks(text: string, max: number): string[] {
  const fits = (piece: string) => wrap(piece, max).length <= 2;
  const split = (piece: string, pattern: RegExp): string[] => piece.split(pattern).map((part) => part.trim()).filter(Boolean);
  return split(text, /(?<=[.?!:])\s+/).flatMap((sentence) => {
    if (fits(sentence)) return [sentence];
    // Clauses, joined back up while they fit.
    const joined: string[] = [];
    for (const clause of split(sentence, /(?<=,)\s+/)) {
      const last = joined.at(-1);
      if (last !== undefined && fits(`${last} ${clause}`)) joined[joined.length - 1] = `${last} ${clause}`;
      else joined.push(clause);
    }
    // A clause still too long: the fewest balanced pieces that each fit (never a lone word left over).
    return joined.flatMap((clause) => (fits(clause) ? [clause] : balanced(clause, max, fits)));
  });
}

/** The shortest a cue stays up (frames), so a short fragment never flashes. */
export const MIN_CUE = FPS;

/**
 * Each piece's share of `frames`, by length, but none under MIN_CUE: a short piece takes time
 * from the longer ones. Pieces are joined while there isn't room for every one to get MIN_CUE.
 */
function share(pieces: string[], frames: number): Array<{ text: string; frames: number }> {
  let list = [...pieces];
  while (list.length > 1 && list.length * MIN_CUE > frames) {
    // Join the shortest piece to its shorter neighbour.
    const i = list.reduce((best, piece, index) => (piece.length < list[best].length ? index : best), 0);
    const j = i === 0 ? 1 : i === list.length - 1 ? i - 1 : list[i - 1].length <= list[i + 1].length ? i - 1 : i + 1;
    const [a, b] = [Math.min(i, j), Math.max(i, j)];
    list = [...list.slice(0, a), `${list[a]} ${list[b]}`, ...list.slice(b + 1)];
  }
  const total = list.reduce((sum, piece) => sum + piece.length, 0);
  const lengths = list.map((piece) => (frames * piece.length) / total);
  const short = lengths.filter((length) => length < MIN_CUE).reduce((sum, length) => sum + (MIN_CUE - length), 0);
  const spare = lengths.filter((length) => length > MIN_CUE).reduce((sum, length) => sum + (length - MIN_CUE), 0);
  const fitted = lengths.map((length) => (length < MIN_CUE ? MIN_CUE : spare > 0 ? length - ((length - MIN_CUE) * short) / spare : length));
  return list.map((text, index) => ({ text, frames: fitted[index] }));
}

/** `text` spoken from `from` for `frames`, as cues of at most two lines (a joined pair may wrap to three). */
function timed(text: string, from: number, frames: number, max: number): Cue[] {
  const pieces = share(chunks(text, max), frames);
  let at = from;
  let elapsed = 0;
  return pieces.map((piece, index) => {
    elapsed += piece.frames;
    const to = index === pieces.length - 1 ? from + frames : from + Math.round(elapsed);
    const cue = { from: at, to, text: wrap(piece.text, max).join("\n") };
    at = to;
    return cue;
  });
}

export function cues(timeline: Timeline, max: number): Cue[] {
  return timeline.segments.flatMap((segment) => {
    if (segment.vo) return timed(segment.vo.text, segment.vo.from, segment.vo.frames, max);
    // The intro's own captions, re-wrapped to this cut's line length.
    return (segment.intro?.captions ?? []).flatMap((caption) =>
      timed(caption.text, segment.from + Math.round(caption.from * FPS), Math.round((Math.min(caption.to, segment.intro!.seconds) - caption.from) * FPS), max),
    );
  });
}

const stamp = (frame: number) => {
  const ms = Math.round((frame / FPS) * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

export function toSrt(list: Cue[]): string {
  return list.map((cue, index) => `${index + 1}\n${stamp(cue.from)} --> ${stamp(cue.to)}\n${cue.text}\n`).join("\n");
}
