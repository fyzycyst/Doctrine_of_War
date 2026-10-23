// The slot for the user's own intro (10–20 s), spliced in after the cold open. A placeholder
// card until then; INTRO=0 (or the composition's `intro: false`) drops it.
import { AbsoluteFill, useVideoConfig } from "remotion";
import { BODY, C, DISPLAY } from "./theme";

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
