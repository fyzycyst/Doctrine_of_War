// Captions (SRT) for the Chronicler's lines, timed from the timeline (the real VO lengths).
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
    // A clause still too long: two lines at a time.
    return joined.flatMap((clause) => {
      if (fits(clause)) return [clause];
      const lines = wrap(clause, max);
      const out: string[] = [];
      for (let i = 0; i < lines.length; i += 2) out.push(lines.slice(i, i + 2).join(" "));
      return out;
    });
  });
}

export function cues(timeline: Timeline, max: number): Cue[] {
  return timeline.segments.flatMap((segment) => {
    const vo = segment.vo;
    if (!vo) return [];
    const pieces = chunks(vo.text, max);
    const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
    let at = vo.from;
    return pieces.map((piece, index) => {
      const to = index === pieces.length - 1 ? vo.from + vo.frames : at + Math.round((vo.frames * piece.length) / total);
      const cue = { from: at, to, text: wrap(piece, max).join("\n") };
      at = to;
      return cue;
    });
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
