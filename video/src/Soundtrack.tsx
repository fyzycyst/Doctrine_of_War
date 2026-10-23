// The sound: each VO line at its shot, and the score's beds under everything, ducked under
// the voice, swelling on the title, cross-faded at the joins; the victory sting under the
// end card. A missing stem leaves its stretch silent.
import { Easing, Html5Audio, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { musicBeds, voWindows, type Media, type Timeline } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/**
 * The mix, as loudness targets (LUFS) rather than gains, so it holds whatever level the takes
 * and stems arrive at (prepare-media measures them; the whole is normalised to -16 after).
 * Every VO line sits at VOICE. Under it the music drops about 14 dB (the usual spacing for
 * narration over music); between lines it sits just under the voice, so a line ending doesn't
 * make the whole thing jump; it swells a little on the title.
 */
const VOICE = -25;
const LEVEL = { bed: -26, title: -23, ducked: -39, sting: -21, stingDucked: -35 };
/** A gain that brings something measured at `measured` LUFS to `target`, never boosting (Html5Audio caps at 1). */
const gainFor = (target: number, measured: number | undefined) => (measured === undefined || Number.isNaN(measured) ? 1 : Math.min(1, 10 ** ((target - measured) / 20)));
/** The duck: quick to drop under a line, slow and eased to rise after it (frames). */
const ATTACK = 6;
const RELEASE = 40;
const OVERLAP = 24; // frames each bed runs on into the next, for the cross-fade

export function Soundtrack({ timeline, media }: { timeline: Timeline; media: Media }) {
  const { fps } = useVideoConfig();
  const windows = voWindows(timeline);
  // 0 in the clear, 1 under a line, ramping either side.
  const duck = (frame: number) =>
    windows.reduce(
      (most, [from, to]) =>
        Math.max(most, Math.min(interpolate(frame, [from - ATTACK, from], [0, 1], clamp), interpolate(frame, [to, to + RELEASE], [1, 0], { ...clamp, easing: Easing.inOut(Easing.sin) }))),
      0,
    );
  const title = timeline.segments.find((segment) => segment.shot?.layout === "title");
  const beds = musicBeds(timeline);

  return (
    <>
      {timeline.segments.map((segment) =>
        segment.vo ? (
          <Sequence key={segment.vo.id} from={segment.vo.from} durationInFrames={segment.vo.frames + 2} name={segment.vo.id}>
            <Html5Audio src={staticFile(segment.vo.file)} volume={gainFor(VOICE, segment.vo.lufs)} />
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
                const clear = gainFor(sting ? LEVEL.sting : onTitle ? LEVEL.title : LEVEL.bed, stem.lufs);
                const under = gainFor(sting ? LEVEL.stingDucked : LEVEL.ducked, stem.lufs);
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
