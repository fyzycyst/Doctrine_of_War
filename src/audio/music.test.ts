import { describe, expect, it } from "vitest";
import { mulberry32 } from "../render/hexWorld";
import { degreeToMidi, MOODS, musicBar, type MusicMood } from "./music";

const inScale = (mood: (typeof MOODS)[MusicMood], midi: number) =>
  mood.scale.includes((((midi - mood.root) % 12) + 12) % 12);

describe("generative score", () => {
  it("keeps every note of every mood in its key", () => {
    for (const name of Object.keys(MOODS) as MusicMood[]) {
      const mood = MOODS[name];
      const rand = mulberry32(7);
      let last = 4;
      for (let i = 0; i < 16; i += 1) {
        const { bar, lastDegree } = musicBar(mood, i, rand, last);
        last = lastDegree;
        for (const m of [...bar.chord, ...bar.melody.map((n) => n.midi)]) expect(inScale(mood, m)).toBe(true);
        expect(bar.melody[0]?.beat).toBe(0);
        expect(bar.melody.every((n) => n.beat >= 0 && n.beat < 4)).toBe(true);
      }
    }
  });

  it("follows each mood's progression and stays in a singable range", () => {
    const mood = MOODS.sunrise;
    const rand = mulberry32(3);
    const roots = [0, 1, 2, 3].map((i) => musicBar(mood, i, rand).bar.chord[0]);
    expect(roots).toEqual(mood.progression.map((d) => degreeToMidi(mood, d) - 12));
    const notes = Array.from({ length: 32 }, (_, i) => musicBar(mood, i, rand).bar.melody.map((n) => n.midi)).flat();
    expect(Math.max(...notes) - Math.min(...notes)).toBeLessThanOrEqual(24);
  });

  it("sounds brighter and busier at sunrise than before dawn", () => {
    expect(MOODS.sunrise.density).toBeGreaterThan(MOODS.predawn.density);
    expect(MOODS.sunrise.brightness).toBeGreaterThan(MOODS.predawn.brightness);
    expect(MOODS.sunrise.scale).toContain(4); // major third
    expect(MOODS.predawn.scale).toContain(1); // phrygian second
  });
});
