import { Canvas } from "@react-three/fiber";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useAppStore } from "../../app/store";
import { useCaptureStore } from "../../app/captureStore";
import type { BoardLayout } from "../../game/board";
import { firstBreach } from "../../game/engine/scenarios/firstBreach";
import { cinematicPaths } from "../camera/cameraPath";
import { CinematicCamera } from "../camera/CinematicCamera";
import { Diorama } from "../Diorama";
import type { DioramaSquad } from "../figures/types";
import { dioramaSquads } from "../fromEngine";
import { LookProvider } from "../look/LookContext";
import { usePrefersReducedMotion } from "../motion";
import { PostFX } from "../post/PostFX";
import { canvasDpr } from "../quality";
import { emberDusk } from "../skins";

/**
 * Title screen scene (T13): a slow, idle-looping crane over the First Breach
 * island at dusk, the Banners standing at Greyford Gate as the Host comes on,
 * embers drifting. The title is an HTML overlay in Cinzel with room for the
 * logo lockup; `children` is the menu slot (hidden in capture mode).
 *
 * Respects prefers-reduced-motion (the camera holds its first frame) and the
 * app's quality setting (low: no bloom/tilt-shift, fewer particles, DPR 1).
 */
export interface TitleSceneProps {
  title?: string;
  subtitle?: string;
  /** Menu / buttons, laid over the lower part of the scene. */
  children?: ReactNode;
  /** Override the hero island (defaults to First Breach). */
  board?: BoardLayout;
  squads?: DioramaSquad[];
  /** Extra nodes rendered inside the Canvas (lab probes, frame stepping). */
  inCanvas?: ReactNode;
  frameloop?: "always" | "demand" | "never";
  /** Seconds into the flyover to start from. */
  startAt?: number;
}

/** First Breach, posed: the Banners closed up at the gate, the Host advancing. */
function heroSquads(): DioramaSquad[] {
  const squads = dioramaSquads(firstBreach.squads);
  return squads.map((s) => (s.id === "greyford_shields" ? { ...s, renowned: true } : s));
}

export function TitleScene({
  title = "DOCTRINE OF WAR",
  subtitle = "Ash & Banner",
  children,
  board = firstBreach.board,
  squads,
  inCanvas,
  frameloop = "always",
  startAt = 0,
}: TitleSceneProps) {
  const quality = useAppStore((s) => s.quality);
  const captureMode = useCaptureStore((s) => s.captureMode);
  const reduced = usePrefersReducedMotion();
  const posed = useMemo(() => squads ?? heroSquads(), [squads]);
  const path = useMemo(() => cinematicPaths(board).titleFlyover!, [board]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#0d0c12" }}>
      <Canvas
        shadows="soft"
        frameloop={frameloop}
        dpr={canvasDpr(quality)}
        camera={{ fov: 30, near: 0.1, far: 200, position: [0, 10, 14] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        <LookProvider skin={emberDusk} timeOfDay="dusk">
          <CinematicCamera path={path} startAt={startAt} reducedMotion={reduced} />
          <Diorama board={board} squads={posed} />
          <PostFX focusY={0.42} />
          {inCanvas}
        </LookProvider>
      </Canvas>
      <div style={titleBlock(reduced)} aria-label={`${title}: ${subtitle}`}>
        <h1 style={titleStyle}>{title}</h1>
        <div style={rule} aria-hidden="true" />
        <p style={subtitleStyle}>{subtitle}</p>
      </div>
      {!captureMode && children && <div style={menuSlot}>{children}</div>}
    </div>
  );
}

const titleBlock = (reduced: boolean): CSSProperties => ({
  position: "absolute",
  top: "7%",
  left: 0,
  right: 0,
  textAlign: "center",
  pointerEvents: "none",
  animation: reduced ? undefined : "dow-title-in 2.4s ease-out both",
});

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "Cinzel, Georgia, serif",
  fontWeight: 700,
  fontSize: "clamp(34px, 6.2vw, 92px)",
  letterSpacing: "0.16em",
  color: "#f2e6c9",
  textShadow: "0 2px 0 rgba(40, 20, 10, 0.6), 0 0 28px rgba(255, 170, 80, 0.35), 0 0 2px rgba(0,0,0,0.8)",
};

const rule: CSSProperties = {
  width: "min(420px, 40vw)",
  height: 1,
  margin: "14px auto 12px",
  background: "linear-gradient(90deg, transparent, rgba(212,166,74,0.9), transparent)",
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "Cinzel, Georgia, serif",
  fontWeight: 600,
  fontSize: "clamp(16px, 2.1vw, 30px)",
  letterSpacing: "0.32em",
  color: "#d4a64a",
  textShadow: "0 0 18px rgba(255, 150, 60, 0.35), 0 1px 0 rgba(0,0,0,0.7)",
};

const menuSlot: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: "8%",
  display: "flex",
  justifyContent: "center",
};

// One global keyframe for the title fade-in (injected once).
if (typeof document !== "undefined" && !document.getElementById("dow-title-keyframes")) {
  const style = document.createElement("style");
  style.id = "dow-title-keyframes";
  style.textContent =
    "@keyframes dow-title-in{from{opacity:0;transform:translateY(-10px);letter-spacing:.3em}to{opacity:1;transform:none}}" +
    "@media (prefers-reduced-motion: reduce){@keyframes dow-title-in{from{opacity:1}to{opacity:1}}}";
  document.head.appendChild(style);
}
