// The slot for the user's own intro (10–20 s), after the cold open. Their clip when
// intro/intro.(mp4|mov|m4v) exists (IntroClip); a placeholder card until then. INTRO=0 (or the
// composition's `intro: false`) drops the slot.
import { AbsoluteFill, Img, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import { Motion } from "./Motion";
import { BODY, C, DISPLAY } from "./theme";
import type { Media } from "./timeline";

export function IntroCard() {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink, justifyContent: "center", alignItems: "center", gap: 28 }}>
      <div style={{ border: `2px dashed ${C.goldLine}`, padding: portrait ? "60px 90px" : "48px 120px", fontFamily: DISPLAY, fontSize: 96, color: C.gold }}>[intro]</div>
      <div style={{ fontFamily: BODY, fontSize: 30, color: C.muted, textAlign: "center", maxWidth: portrait ? 860 : 1200 }}>
        The user's intro (10–20 s) is spliced here · INTRO=0 drops this card
      </div>
    </AbsoluteFill>
  );
}

/**
 * The user's intro clip, at its own length (its sound is laid by Soundtrack, levelled). Keyed
 * off a green background (KeyedIntro) when it was filmed on one. Otherwise, 16:9: fitted whole,
 * letterboxed if its shape differs; 9:16: a portrait clip fills the frame, any other fills the
 * width over a blurred, darkened copy of itself.
 */
export function IntroClip({ intro, media }: { intro: NonNullable<Media["intro"]>; media: Media }) {
  const { width, height } = useVideoConfig();
  if (intro.keyed) return <KeyedIntro intro={intro} keyed={intro.keyed} media={media} />;
  const video = (style: React.CSSProperties) => <OffthreadVideo src={staticFile(intro.file)} muted style={{ width: "100%", height: "100%", ...style }} />;
  const portraitFrame = height > width;
  const portraitClip = intro.height > intro.width;
  if (portraitFrame && portraitClip) return <AbsoluteFill style={{ backgroundColor: "#000" }}>{video({ objectFit: "cover" })}</AbsoluteFill>;
  if (portraitFrame) {
    const h = (width * intro.height) / intro.width;
    return (
      <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
        {video({ objectFit: "cover", filter: "blur(36px) brightness(0.42)", transform: "scale(1.15)" })}
        <div style={{ position: "absolute", left: 0, top: (height - h) / 2, width, height: h, boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}>{video({ objectFit: "contain" })}</div>
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>{video({ objectFit: "contain" })}</AbsoluteFill>;
}

/** A thin gold hairline frame with diamond corners, in the plate style. */
function Hairline({ inset }: { inset: number }) {
  const corner = (position: React.CSSProperties) => <div style={{ position: "absolute", width: 12, height: 12, background: C.gold, transform: "rotate(45deg)", ...position }} />;
  return (
    <div style={{ position: "absolute", inset, border: `1.5px solid ${C.goldLine}`, boxShadow: "0 0 24px rgba(212, 166, 74, 0.12)" }}>
      {corner({ left: -7, top: -7 })}
      {corner({ right: -7, top: -7 })}
      {corner({ left: -7, bottom: -7 })}
      {corner({ right: -7, bottom: -7 })}
    </div>
  );
}

/**
 * The keyed intro, set in the world: the archipelago at dusk (the end card's clip, slowed to
 * span the intro, darkened and softened, panning slowly) behind a gold hairline frame, the
 * speaker in front of it (their shoulders break its foot), and a small mark in a corner. 16:9:
 * the speaker anchored to the foot of the frame, sides cropped; 9:16: larger, the face in the
 * upper third, clear of captions at the bottom.
 */
function KeyedIntro({ intro, keyed, media }: { intro: NonNullable<Media["intro"]>; keyed: string; media: Media }) {
  const { width, height, fps } = useVideoConfig();
  const portrait = height > width;
  const frames = Math.round(intro.seconds * fps);
  const backdrop = media.clips["s11-end-card"] ?? media.clips["s02-title"];
  const still = media.stills["s11-end-card"]?.[0];
  const soft: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", filter: "blur(5px) brightness(0.65) saturate(0.9)" };
  // The keyed frame is 1920 wide; scale it to this height, bottom-anchored, centred.
  const personHeight = portrait ? 1400 : 1000;
  const personWidth = (personHeight * intro.width) / intro.height;
  const inset = portrait ? 44 : 36;
  return (
    <AbsoluteFill style={{ backgroundColor: C.ash, overflow: "hidden" }}>
      <Motion move="pan-left" frames={frames}>
        {backdrop ? (
          <OffthreadVideo src={staticFile(backdrop.file)} muted playbackRate={Math.min(1, backdrop.seconds / intro.seconds)} style={soft} />
        ) : still ? (
          <Img src={staticFile(still.file)} style={soft} />
        ) : null}
      </Motion>
      <AbsoluteFill style={{ background: "radial-gradient(110% 85% at 50% 40%, transparent 40%, rgba(5, 4, 8, 0.7) 100%)" }} />
      <Hairline inset={inset} />
      <div
        style={{
          position: "absolute",
          fontFamily: DISPLAY,
          fontWeight: 600,
          fontSize: portrait ? 30 : 24,
          letterSpacing: "0.24em",
          color: C.gold,
          opacity: 0.85,
          textShadow: "0 2px 10px rgba(0,0,0,0.8)",
          ...(portrait ? { top: inset + 56, left: 0, right: 0, textAlign: "center" } : { top: inset + 30, left: inset + 36 }),
        }}
      >
        DOCTRINE OF WAR
      </div>
      <div style={{ position: "absolute", bottom: 0, left: (width - personWidth) / 2, width: personWidth, height: personHeight }}>
        <OffthreadVideo src={staticFile(keyed)} muted transparent style={{ width: "100%", height: "100%", filter: "drop-shadow(0 16px 36px rgba(0, 0, 0, 0.55))" }} />
      </div>
    </AbsoluteFill>
  );
}
