// A shot's picture: the render agent's clip when the manifest lists one (a montage's parts cut
// evenly), else stand-in stills. One camera move runs across the whole shot, or each part of a
// montage gets its own (script.ts `move`), so a cut never reads as a zoom resetting. In 9:16 a
// shot is cropped around a focal x, or "fit": a range of the frame filling the width over a
// blurred, darkened copy of itself (script.ts `vertical`).
import { AbsoluteFill, Freeze, Img, OffthreadVideo, Sequence, staticFile, useVideoConfig } from "remotion";
import { Motion } from "./Motion";
import type { Shot } from "./script";
import type { Media } from "./timeline";

interface Part {
  file: string;
  kind: "video" | "image";
  /** Usable length after `start`, in seconds (stills: unlimited). */
  seconds: number;
  start: number;
  focalX: number;
  focalY: number;
}

function Picture({ part, frames, style }: { part: Part; frames: number; style: React.CSSProperties }) {
  const { fps } = useVideoConfig();
  if (part.kind === "image") return <Img src={staticFile(part.file)} style={style} />;
  const start = Math.round(part.start * fps);
  const clipFrames = Math.floor((part.seconds - part.start) * fps);
  const video = <OffthreadVideo src={staticFile(part.file)} muted trimBefore={start} style={style} />;
  return (
    <>
      <Sequence durationInFrames={Math.min(frames, clipFrames)}>{video}</Sequence>
      {/* A clip shorter than its shot holds its last frame. */}
      {clipFrames < frames && (
        <Sequence from={clipFrames}>
          <Freeze frame={clipFrames - 1}>{video}</Freeze>
        </Sequence>
      )}
    </>
  );
}

/** One part, framed for the composition's shape. */
function Framed({ part, frames, shot }: { part: Part; frames: number; shot: Shot }) {
  const { width, height } = useVideoConfig();
  const vertical = height > width ? shot.vertical : undefined;
  if (vertical && "fit" in vertical) {
    const [x0, x1] = vertical.fit;
    const w = width / (x1 - x0);
    const h = (w * 9) / 16;
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Picture part={part} frames={frames} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(36px) brightness(0.42)", transform: "scale(1.15)" }} />
        <div style={{ position: "absolute", left: -x0 * w, top: height * (vertical.y ?? 0.42) - h / 2, width: w, height: h, boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}>
          <Picture part={part} frames={frames} style={{ width: "100%", height: "100%" }} />
        </div>
      </AbsoluteFill>
    );
  }
  const focalX = (vertical && "crop" in vertical ? vertical.crop.focalX : undefined) ?? part.focalX;
  return <Picture part={part} frames={frames} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${focalX * 100}% ${part.focalY * 100}%` }} />;
}

function partsOf(shot: Shot, media: Media): Part[] {
  const clip = media.clips[shot.id];
  if (clip?.parts?.length) return clip.parts.map((part) => ({ ...part, kind: "video", start: 0, focalY: 0.5 }));
  if (clip) return [{ ...clip, kind: "video", start: shot.clipStart ?? 0, focalY: 0.5 }];
  return (media.stills[shot.id] ?? []).map((still) => ({ ...still, kind: "image", seconds: Infinity, start: 0 }));
}

export function Footage({ shot, frames, media }: { shot: Shot; frames: number; media: Media }) {
  const parts = partsOf(shot, media);
  const each = Math.ceil(frames / Math.max(1, parts.length));
  const moves = Array.isArray(shot.move) ? shot.move : null;
  const sequence = parts.map((part, index) => (
    <Sequence key={part.file} from={index * each} durationInFrames={each}>
      {moves ? (
        <Motion move={moves[index % moves.length]} frames={each} origin={[part.focalX, part.focalY]}>
          <Framed part={part} frames={each} shot={shot} />
        </Motion>
      ) : (
        <Framed part={part} frames={each} shot={shot} />
      )}
    </Sequence>
  ));
  if (Array.isArray(shot.move)) return <AbsoluteFill>{sequence}</AbsoluteFill>;
  // One move across the whole shot, whatever cuts it holds.
  return (
    <Motion move={shot.move} frames={frames} origin={[parts[0]?.focalX ?? 0.5, parts[0]?.focalY ?? 0.5]}>
      {sequence}
    </Motion>
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
