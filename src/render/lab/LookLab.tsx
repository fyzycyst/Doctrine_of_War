import { Stats } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAppStore, type RenderQuality } from "../../app/store";
import { DioramaCamera, SHOTS } from "../camera/DioramaCamera";
import { Diorama } from "../Diorama";
import type { FigureApproach } from "../figures/types";
import { LookProvider } from "../look/LookContext";
import { PostFX } from "../post/PostFX";
import { getSkin, isTimeOfDay, SKINS, TIME_OF_DAY_KEYS, type TimeOfDay } from "../skins";
import { LAB_BOARD, LAB_FOG_DEMO, LAB_SQUADS } from "./labScene";

/**
 * Dev-only Look Lab (`?lab=1`). Full-screen diorama with a small switcher.
 * URL params: preset, skin, figures (toy|kaykit), quality (high|low),
 * cam (wide|close), ui (0 hides the panel), still (1 disables idle drift),
 * fog (1 shows the fog-of-war mist demo).
 *
 * Exposes `window.__lookLab = { ready, frames, fps }` for the capture script.
 */

type LabState = {
  preset: TimeOfDay;
  skin: string;
  figures: FigureApproach;
  cam: "wide" | "close";
  fog: boolean;
};

declare global {
  interface Window {
    __lookLab?: { ready: boolean; frames: number; fps: number; figuresReady: boolean };
  }
}

function readParams(): LabState & { quality: RenderQuality; ui: boolean; still: boolean } {
  const p = new URLSearchParams(window.location.search);
  const preset = p.get("preset");
  const figures = p.get("figures");
  return {
    preset: isTimeOfDay(preset) ? preset : "dusk",
    skin: getSkin(p.get("skin")).id,
    figures: figures === "b" || figures === "kaykit" ? "kaykit" : "toy",
    cam: p.get("cam") === "close" ? "close" : "wide",
    fog: p.get("fog") === "1",
    quality: p.get("quality") === "low" ? "low" : "high",
    ui: p.get("ui") !== "0",
    still: p.get("still") === "1",
  };
}

export function LookLab() {
  const initial = useMemo(readParams, []);
  const [state, setState] = useState<LabState>(initial);
  const quality = useAppStore((s) => s.quality);
  const setQuality = useAppStore((s) => s.setQuality);
  const [figuresReady, setFiguresReady] = useState(false);

  useEffect(() => {
    setQuality(initial.quality);
  }, [initial.quality, setQuality]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set("preset", state.preset);
    p.set("skin", state.skin);
    p.set("figures", state.figures === "kaykit" ? "b" : "a");
    p.set("cam", state.cam);
    p.set("quality", quality);
    if (state.fog) p.set("fog", "1");
    else p.delete("fog");
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }, [state, quality]);

  useEffect(() => {
    setFiguresReady(false);
  }, [state.figures]);

  const skin = getSkin(state.skin);
  const shot = SHOTS[state.cam];
  const onFiguresReady = useCallback(() => setFiguresReady(true), []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d0c12" }}>
      <Canvas
        shadows="soft"
        dpr={quality === "high" ? [1, 2] : 1}
        camera={{ fov: 30, near: 0.1, far: 200, position: [0, 10, 14] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      >
        <LookProvider skin={skin} timeOfDay={state.preset}>
          <DioramaCamera shot={shot} drift={!initial.still} />
          <Diorama
            board={LAB_BOARD}
            squads={LAB_SQUADS}
            figures={state.figures}
            mistDensity={state.fog ? LAB_FOG_DEMO : undefined}
            onFiguresReady={onFiguresReady}
          />
          <PostFX />
          <FrameProbe figuresReady={figuresReady} />
        </LookProvider>
      </Canvas>
      {initial.ui && (
        <>
          <Stats className="look-lab-stats" />
          <LabPanel
            state={state}
            quality={quality}
            onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            onQuality={setQuality}
          />
        </>
      )}
    </div>
  );
}

/** Counts frames and a rolling FPS for the capture script and fps readings. */
function FrameProbe({ figuresReady }: { figuresReady: boolean }) {
  const acc = useRef({ frames: 0, windowStart: 0, windowFrames: 0, fps: 0 });
  useEffect(() => {
    window.__lookLab = { ready: false, frames: 0, fps: 0, figuresReady: false };
    acc.current.frames = 0;
  }, [figuresReady]);
  useFrame(({ clock }) => {
    const a = acc.current;
    const t = clock.elapsedTime;
    a.frames += 1;
    a.windowFrames += 1;
    if (t - a.windowStart >= 1) {
      a.fps = a.windowFrames / (t - a.windowStart);
      a.windowStart = t;
      a.windowFrames = 0;
    }
    window.__lookLab = {
      ready: figuresReady && a.frames > 90,
      frames: a.frames,
      fps: Math.round(a.fps * 10) / 10,
      figuresReady,
    };
  });
  return null;
}

const panel: CSSProperties = {
  position: "fixed",
  top: 12,
  right: 12,
  width: 230,
  padding: "12px 14px",
  background: "rgba(20, 16, 22, 0.78)",
  border: "1px solid rgba(212, 166, 74, 0.55)",
  borderRadius: 8,
  color: "#efe3c8",
  font: "13px/1.35 'Alegreya Sans', system-ui, sans-serif",
  backdropFilter: "blur(6px)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
};

const label: CSSProperties = {
  display: "block",
  margin: "10px 0 4px",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#b9a98c",
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        margin: "0 4px 4px 0",
        padding: "3px 8px",
        borderRadius: 4,
        border: `1px solid ${active ? "#d4a64a" : "rgba(239,227,200,0.25)"}`,
        background: active ? "rgba(212,166,74,0.22)" : "transparent",
        color: "#efe3c8",
        font: "inherit",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function LabPanel({
  state,
  quality,
  onChange,
  onQuality,
}: {
  state: LabState;
  quality: RenderQuality;
  onChange: (patch: Partial<LabState>) => void;
  onQuality: (q: RenderQuality) => void;
}) {
  const skin = getSkin(state.skin);
  return (
    <div style={panel}>
      <div style={{ fontFamily: "Cinzel, Georgia, serif", letterSpacing: "0.08em", fontSize: 14 }}>LOOK LAB</div>
      <span style={label}>Time of day</span>
      {TIME_OF_DAY_KEYS.map((key) => (
        <Chip key={key} active={state.preset === key} onClick={() => onChange({ preset: key })}>
          {skin.lighting[key].label}
        </Chip>
      ))}
      <span style={label}>Skin</span>
      {Object.values(SKINS).map((s) => (
        <Chip key={s.id} active={state.skin === s.id} onClick={() => onChange({ skin: s.id })}>
          {s.label}
        </Chip>
      ))}
      <span style={label}>Figures</span>
      <Chip active={state.figures === "toy"} onClick={() => onChange({ figures: "toy" })}>
        (a) Toy soldiers
      </Chip>
      <Chip active={state.figures === "kaykit"} onClick={() => onChange({ figures: "kaykit" })}>
        (b) KayKit CC0
      </Chip>
      <span style={label}>Camera · Quality · Fog</span>
      <Chip active={state.cam === "wide"} onClick={() => onChange({ cam: "wide" })}>
        Wide
      </Chip>
      <Chip active={state.cam === "close"} onClick={() => onChange({ cam: "close" })}>
        Close
      </Chip>
      <Chip active={quality === "high"} onClick={() => onQuality(quality === "high" ? "low" : "high")}>
        {quality === "high" ? "High" : "Low"}
      </Chip>
      <Chip active={state.fog} onClick={() => onChange({ fog: !state.fog })}>
        Fog demo
      </Chip>
    </div>
  );
}

