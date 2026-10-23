// The slot for the user's own intro (10–20 s), after the cold open. Their clip when
// intro/intro.(mp4|mov|m4v) exists (IntroClip); a placeholder card until then. INTRO=0 (or the
// composition's `intro: false`) drops the slot.
import { AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
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
 * The user's intro clip, at its own length (its sound is laid by Soundtrack, levelled). 16:9:
 * fitted whole, letterboxed if its shape differs. 9:16: a portrait clip fills the frame; any
 * other fills the width over a blurred, darkened copy of itself.
 */
export function IntroClip({ intro }: { intro: NonNullable<Media["intro"]> }) {
  const { width, height } = useVideoConfig();
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
