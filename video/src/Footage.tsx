// A shot's picture: the render agent's clip when the manifest lists one, else stand-in stills
// with a slow push-in (several stills cut evenly). In 9:16 the frame is cropped around the
// shot's focal x. A short settle on each cut gives the quick cuts some punch.
import { AbsoluteFill, Freeze, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Media } from "./timeline";

const cover = (focalX: number, focalY = 0.5) => ({ width: "100%", height: "100%", objectFit: "cover" as const, objectPosition: `${focalX * 100}% ${focalY * 100}%` });

/** The cut's settle: a slight scale-down over the first frames of a shot. */
function useSettle() {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, 8], [1.035, 1], { extrapolateRight: "clamp", easing: (t) => 1 - (1 - t) ** 3 });
}

function Still({ file, focalX, focalY, frames }: { file: string; focalX: number; focalY: number; frames: number }) {
  const frame = useCurrentFrame();
  const settle = useSettle();
  const push = interpolate(frame, [0, frames], [1.04, 1.14]);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={staticFile(file)} style={{ ...cover(focalX, focalY), transform: `scale(${push * settle})`, transformOrigin: `${focalX * 100}% ${focalY * 100}%` }} />
    </AbsoluteFill>
  );
}

function Clip({ file, seconds, focalX, frames }: { file: string; seconds: number; focalX: number; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const settle = useSettle();
  const clipFrames = Math.floor(seconds * fps);
  const video = <OffthreadVideo src={staticFile(file)} muted style={cover(focalX)} />;
  // A gentle push-in on every clip: it moves a locked-off camera (the end card) and lifts
  // the in-game callouts, which are fixed-size and read small at 1080p.
  const push = interpolate(frame, [0, frames], [1, 1.06]);
  return (
    <AbsoluteFill style={{ transform: `scale(${settle * push})`, transformOrigin: `${focalX * 100}% 50%` }}>
      <Sequence durationInFrames={Math.min(frames, clipFrames)}>{video}</Sequence>
      {/* A clip shorter than its shot holds its last frame. */}
      {clipFrames < frames && (
        <Sequence from={clipFrames}>
          <Freeze frame={clipFrames - 1}>{video}</Freeze>
        </Sequence>
      )}
    </AbsoluteFill>
  );
}

export function Footage({ id, frames, media }: { id: string; frames: number; media: Media }) {
  const clip = media.clips[id as keyof Media["clips"]];
  // A montage with parts: each part gets an even share of the shot (trimmed at its end), so a
  // joined clip longer than the shot doesn't lose its last beat.
  const parts = clip?.parts?.length ? clip.parts : clip ? [clip] : null;
  if (parts) {
    const each = Math.ceil(frames / parts.length);
    return (
      <AbsoluteFill>
        {parts.map((part, index) => (
          <Sequence key={part.file} from={index * each} durationInFrames={each}>
            <Clip {...part} frames={each} />
          </Sequence>
        ))}
      </AbsoluteFill>
    );
  }
  const stills = media.stills[id as keyof Media["stills"]] ?? [];
  const each = Math.ceil(frames / Math.max(1, stills.length));
  return (
    <AbsoluteFill>
      {stills.map((still, index) => (
        <Sequence key={still.file} from={index * each} durationInFrames={each}>
          <Still {...still} frames={each} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

/** The grade over the picture: a vignette, and a darker foot for the type. */
export function Grade({ strength = 1 }: { strength?: number }) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(5, 4, 8, ${0.55 * strength}) 100%), linear-gradient(180deg, rgba(5, 4, 8, ${0.15 * strength}) 0%, transparent 30%, transparent 55%, rgba(5, 4, 8, ${0.6 * strength}) 100%)`,
      }}
    />
  );
}
