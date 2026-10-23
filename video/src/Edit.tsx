// The cut: each segment of the timeline in turn (hard cuts, as a trailer cuts), the
// soundtrack under all of it, a fade up from black and down to black.
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { IntroCard } from "./IntroCard";
import media from "./generated/media.json";
import { ShotView } from "./ShotView";
import { Soundtrack } from "./Soundtrack";
import { C } from "./theme";
import { buildTimeline, type Media } from "./timeline";

export type EditProps = { intro: boolean };

export function Edit({ intro }: EditProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const timeline = buildTimeline(media as Media, { intro });
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const fade = Math.max(interpolate(frame, [0, 12], [1, 0], clamp), interpolate(frame, [durationInFrames - 20, durationInFrames - 1], [0, 1], clamp));
  return (
    <AbsoluteFill style={{ backgroundColor: C.ash }}>
      {timeline.segments.map((segment) => (
        <Sequence key={segment.id} from={segment.from} durationInFrames={segment.frames} name={segment.id}>
          {segment.kind === "intro" ? <IntroCard /> : <ShotView segment={segment} media={media as Media} />}
        </Sequence>
      ))}
      <Soundtrack timeline={timeline} media={media as Media} />
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
}
