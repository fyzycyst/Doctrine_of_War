// One shot: its footage, graded, with its on-screen text, the title lockup or the end card.
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Footage, Grade } from "./Footage";
import { KineticText } from "./KineticText";
import { Lockup } from "./Lockup";
import { COPYRIGHT, END_CARD } from "./script";
import { BODY, C, DISPLAY } from "./theme";
import type { Media, Segment } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function Title({ frames }: { frames: number }) {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [frames - 10, frames - 1], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: out, transform: `scale(${interpolate(frame, [0, frames], [1, 1.04])})` }}>
      <Lockup delay={4} />
    </AbsoluteFill>
  );
}

function EndCard() {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const portrait = height > width;
  const rise = (at: number) => ({
    opacity: interpolate(frame, [at, at + 12], [0, 1], clamp),
    transform: `translateY(${interpolate(frame, [at, at + 14], [18, 0], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })}px)`,
  });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: portrait ? 90 : 64, padding: portrait ? "0 60px" : 0 }}>
      <Lockup delay={0} scale={portrait ? 0.62 : 0.6} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: portrait ? 44 : 26 }}>
        {END_CARD.map((line, index) => (
          <div key={line.label} style={{ ...rise(16 + index * 8), textAlign: "center" }}>
            <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: portrait ? 34 : 28, letterSpacing: "0.16em", textTransform: "uppercase", color: C.gold }}>{line.label}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: portrait ? 48 : 52, lineHeight: 1.2, color: C.bone, textShadow: "0 2px 14px rgba(0,0,0,0.8)" }}>
              {/* 9:16 is too narrow for the long address on one line: it breaks after its last slash. */}
              {portrait && line.value.includes("/") ? (
                <>
                  {line.value.slice(0, line.value.lastIndexOf("/") + 1)}
                  <br />
                  {line.value.slice(line.value.lastIndexOf("/") + 1)}
                </>
              ) : (
                line.value
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...rise(36), position: "absolute", bottom: portrait ? 140 : 56, fontFamily: BODY, fontSize: portrait ? 28 : 24, color: C.muted, letterSpacing: "0.06em" }}>{COPYRIGHT}</div>
    </AbsoluteFill>
  );
}

export function ShotView({ segment, media }: { segment: Segment; media: Media }) {
  const shot = segment.shot!;
  const frames = segment.frames;
  const layout = shot.layout;
  return (
    <AbsoluteFill>
      <Footage id={shot.id} frames={frames} media={media} />
      <Grade strength={layout === "end" ? 2.2 : layout === "title" ? 1.6 : 1} />
      {layout && <AbsoluteFill style={{ backgroundColor: `rgba(8, 6, 10, ${layout === "end" ? 0.45 : 0.35})` }} />}
      {layout === "title" && <Title frames={frames} />}
      {layout === "end" && <EndCard />}
      {!layout && shot.text && <KineticText text={shot.text} frames={frames} />}
    </AbsoluteFill>
  );
}
