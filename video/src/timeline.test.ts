import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunks, cues, LINE_LENGTH, toSrt, wrap } from "./captions";
import { SHOTS } from "./script";
import { buildTimeline, FPS, musicBeds, toFrames, VO_LEAD, VO_TAIL, voWindows, type Media } from "./timeline";

const silent: Media = { vo: {}, clips: {}, stills: {}, music: {} };
const withVo = (seconds: number): Media => ({
  ...silent,
  vo: Object.fromEntries(SHOTS.flatMap((shot) => (shot.vo ? [[shot.vo.id, { file: `vo/${shot.vo.id}.mp3`, seconds, source: "final" as const }]] : []))),
});

describe("the timeline", () => {
  it("runs the script's targets (92 s) with no VO, plus the intro slot after the cold open", () => {
    const plain = buildTimeline(silent, { intro: false });
    assert.equal(plain.frames, 92 * FPS);
    assert.deepEqual(plain.segments.map((segment) => segment.id), SHOTS.map((shot) => shot.id));
    const withIntro = buildTimeline(silent, { intro: true });
    assert.equal(withIntro.frames, 94 * FPS);
    assert.equal(withIntro.segments[1].id, "intro");
    assert.equal(withIntro.segments[1].from, 5 * FPS);
  });

  it("keeps a shot's target as its minimum, and stretches it to fit a long line", () => {
    const short = buildTimeline(withVo(1), { intro: false });
    assert.equal(short.frames, 92 * FPS);
    const long = buildTimeline(withVo(10), { intro: false });
    const title = long.segments.find((segment) => segment.id === "s02-title")!;
    assert.equal(title.frames, toFrames(VO_LEAD + 10 + VO_TAIL));
    assert.equal(title.vo!.from, title.from + toFrames(VO_LEAD));
    // Shots follow each other with no gaps.
    long.segments.slice(1).forEach((segment, index) => assert.equal(segment.from, long.segments[index].from + long.segments[index].frames));
  });

  it("ducks under every line, and lays the score's beds by stem", () => {
    const timeline = buildTimeline(withVo(2), { intro: true });
    assert.equal(voWindows(timeline).length, 10);
    assert.deepEqual(
      musicBeds(timeline).map((bed) => bed.stem),
      ["dusk", "battle", "dawn", "battle", "dusk", "victory"],
    );
    assert.equal(musicBeds(timeline).reduce((sum, bed) => sum + bed.frames, 0), timeline.frames);
  });
});

describe("captions", () => {
  it("wraps to the line length, at most two lines a cue, and keeps every word", () => {
    const text = SHOTS.find((shot) => shot.vo?.id === "vo-07")!.vo!.text;
    for (const max of [LINE_LENGTH.main, LINE_LENGTH.vertical]) {
      const pieces = chunks(text, max);
      assert.equal(pieces.join(" "), text);
      for (const piece of pieces) assert.ok(wrap(piece, max).length <= 2 && wrap(piece, max).every((line) => line.length <= max), piece);
    }
  });

  it("times cues inside their line, in order, and writes SRT", () => {
    const timeline = buildTimeline(withVo(3), { intro: true });
    const list = cues(timeline, LINE_LENGTH.main);
    list.slice(1).forEach((cue, index) => assert.ok(cue.from >= list[index].to));
    const srt = toSrt(list);
    assert.match(srt, /^1\n00:00:07,\d{3} --> 00:00:\d\d,\d{3}\nI have outlived three kings,/);
    assert.match(srt, /Choose your orders well\.\n$/);
  });
});
