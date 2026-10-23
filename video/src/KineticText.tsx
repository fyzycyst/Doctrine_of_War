// On-screen text: Cinzel on a dark plate between gold hairlines with diamond ends, a nod to
// the game's rule banners. The plate opens, the words punch in one after another, and the
// whole thing lifts away before the cut.
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, DISPLAY } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function Hairline({ at }: { at: "top" | "bottom" }) {
  const diamond = (side: "left" | "right") => (
    <div style={{ position: "absolute", [side]: -7, top: -6, width: 12, height: 12, background: C.gold, transform: "rotate(45deg)" }} />
  );
  return (
    <div style={{ position: "absolute", left: 0, right: 0, [at]: 0, height: 1.5, background: `linear-gradient(90deg, ${C.gold}, ${C.goldHi} 50%, ${C.gold})` }}>
      {diamond("left")}
      {diamond("right")}
    </div>
  );
}

export function KineticText({ text, frames, delay = 6 }: { text: string; frames: number; delay?: number }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const open = spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 220 } });
  const leave = interpolate(frame, [frames - 12, frames - 3], [0, 1], { ...clamp, easing: (t) => t * t });
  // A separator ("·") keeps to the word after it, so a line never ends on one.
  const words = text.split(" ").reduce<string[]>((list, word) => (list.at(-1) === "·" ? [...list.slice(0, -1), `· ${word}`] : [...list, word]), []);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: portrait ? 560 : 150 }}>
      <div
        style={{
          position: "relative",
          maxWidth: portrait ? 940 : 1560,
          padding: portrait ? "34px 48px" : "26px 64px",
          background: "rgba(16, 13, 19, 0.74)",
          backdropFilter: "blur(6px)",
          opacity: Math.min(1, open * 1.5) * (1 - leave),
          transform: `translateY(${-leave * 34}px) scaleX(${0.7 + 0.3 * open})`,
        }}
      >
        <Hairline at="top" />
        <Hairline at="bottom" />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            columnGap: "0.32em",
            fontFamily: DISPLAY,
            fontWeight: 600,
            fontSize: portrait ? 92 : 84,
            lineHeight: 1.12,
            letterSpacing: "0.02em",
            color: C.bone,
            textAlign: "center",
            textShadow: "0 3px 18px rgba(0, 0, 0, 0.6)",
            transform: `scaleX(${1 / (0.7 + 0.3 * open)})`,
          }}
        >
          {words.map((word, index) => {
            // The first word lands with the plate (never an empty box); the rest follow it in.
            const s = spring({ frame: frame - delay - index * 3, fps, config: { damping: 13, stiffness: 170, mass: 0.6 } });
            return (
              <span
                key={`${word}-${index}`}
                style={{
                  display: "inline-block",
                  whiteSpace: "pre",
                  opacity: Math.min(1, s * 2.2),
                  transform: `translateY(${(1 - s) * 56}px) scale(${0.88 + 0.12 * s})`,
                  filter: `blur(${Math.max(0, (1 - s) * 8)}px)`,
                }}
              >
                {word.startsWith("· ") ? (
                  <>
                    <span style={{ color: C.gold }}>·</span>
                    {word.slice(1)}
                  </>
                ) : (
                  word
                )}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
