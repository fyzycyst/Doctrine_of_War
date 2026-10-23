// The sound: each VO line at its shot, and the score's beds under everything, ducked under
// the voice, swelling on the title, cross-faded at the joins; the victory sting under the
// end card. A missing stem leaves its stretch silent.
import { Html5Audio, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { musicBeds, voWindows, type Media, type Timeline } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** Bed level in the clear, under the voice, and on the title. */
const LEVEL = { bed: 0.5, ducked: 0.17, title: 0.85, sting: 0.8, stingDucked: 0.45 };
const RAMP = 9; // frames to duck and recover
const OVERLAP = 24; // frames each bed runs on into the next, for the cross-fade

export function Soundtrack({ timeline, media }: { timeline: Timeline; media: Media }) {
  const { fps } = useVideoConfig();
  const windows = voWindows(timeline);
  // 0 in the clear, 1 under a line, ramping either side.
  const duck = (frame: number) =>
    windows.reduce((most, [from, to]) => Math.max(most, Math.min(interpolate(frame, [from - RAMP, from], [0, 1], clamp), interpolate(frame, [to, to + RAMP], [1, 0], clamp))), 0);
  const title = timeline.segments.find((segment) => segment.shot?.layout === "title");
  const beds = musicBeds(timeline);

  return (
    <>
      {timeline.segments.map((segment) =>
        segment.vo ? (
          <Sequence key={segment.vo.id} from={segment.vo.from} durationInFrames={segment.vo.frames + 2} name={segment.vo.id}>
            <Html5Audio src={staticFile(segment.vo.file)} />
          </Sequence>
        ) : null,
      )}
      {beds.map((bed, index) => {
        const stem = media.music[bed.stem];
        if (!stem) return null;
        const last = index === beds.length - 1;
        const length = bed.frames + (last ? 0 : OVERLAP);
        const sting = bed.stem === "victory";
        const fits = stem.seconds - bed.start >= length / fps;
        return (
          <Sequence key={`${bed.stem}-${bed.from}`} from={bed.from} durationInFrames={length} name={`music: ${bed.stem}`}>
            <Html5Audio
              src={staticFile(stem.file)}
              trimBefore={Math.round(bed.start * fps)}
              loop={!fits && !sting}
              volume={(f) => {
                const at = bed.from + f;
                const onTitle = title && at >= title.from && at < title.from + title.frames;
                const clear = sting ? LEVEL.sting : onTitle ? LEVEL.title : LEVEL.bed;
                const under = sting ? LEVEL.stingDucked : LEVEL.ducked;
                const level = clear + (under - clear) * duck(at);
                const fadeIn = index === 0 || sting ? 1 : interpolate(f, [0, OVERLAP], [0, 1], clamp);
                const fadeOut = last ? interpolate(f, [length - fps, length - 1], [1, 0], clamp) : interpolate(f, [bed.frames, length - 1], [1, 0], clamp);
                return level * fadeIn * fadeOut;
              }}
            />
          </Sequence>
        );
      })}
    </>
  );
}
