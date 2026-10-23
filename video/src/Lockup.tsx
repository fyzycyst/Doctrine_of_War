// "DOCTRINE OF WAR · Ash & Banner": the title lockup. The name draws in from wide letter
// spacing in banner gold; the subtitle opens between two rules. Stacked in 9:16.
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LOCKUP } from "./script";
import { C, DISPLAY } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export function Lockup({ delay = 0, scale = 1 }: { delay?: number; scale?: number }) {
  const frame = useCurrentFrame() - delay;
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const draw = spring({ frame, fps, config: { damping: 200, stiffness: 60 } });
  const sub = spring({ frame: frame - 14, fps, config: { damping: 200, stiffness: 90 } });
  const glow = interpolate(frame, [0, 30, 70], [0, 1, 0.55], clamp);
  const size = (portrait ? 116 : 156) * scale;
  const name = portrait ? ["Doctrine", "of War"] : [LOCKUP.title];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 * scale }}>
      {name.map((line) => (
        <div
          key={line}
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: size,
            lineHeight: 1,
            textTransform: "uppercase",
            letterSpacing: `${interpolate(draw, [0, 1], [0.42, 0.07])}em`,
            marginRight: `-${interpolate(draw, [0, 1], [0.42, 0.07])}em`,
            background: `linear-gradient(180deg, ${C.goldHi} 0%, ${C.gold} 62%, #a87a2c 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            opacity: Math.min(1, draw * 1.4),
            filter: `drop-shadow(0 0 ${28 * glow}px rgba(240, 198, 107, ${0.55 * glow})) drop-shadow(0 4px 14px rgba(0, 0, 0, 0.7))`,
            whiteSpace: "nowrap",
          }}
        >
          {line}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 26 * scale, opacity: sub }}>
        <div style={{ width: 150 * scale * sub, height: 1.5, background: `linear-gradient(90deg, transparent, ${C.gold})` }} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 52 * scale, letterSpacing: "0.22em", color: C.bone, textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>
          {LOCKUP.subtitle.toUpperCase()}
        </div>
        <div style={{ width: 150 * scale * sub, height: 1.5, background: `linear-gradient(90deg, ${C.gold}, transparent)` }} />
      </div>
    </div>
  );
}
