import { Stats } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAppStore, type RenderQuality } from "../../app/store";
import { hexKey } from "../../game/board";
import { closeShot, DioramaCamera, wideShot, type CameraShot } from "../camera/DioramaCamera";
import { Diorama } from "../Diorama";
import type { SquadAnimationApi, SquadAnimator } from "../figures/squadAnimation";
import type { FigureApproach } from "../figures/types";
import { boardRadius } from "../hexWorld";
import { LookProvider } from "../look/LookContext";
import { PostFX } from "../post/PostFX";
import { getSkin, isTimeOfDay, SKINS, TIME_OF_DAY_KEYS, type TimeOfDay } from "../skins";
import { LAB_SCENES, stepToward, type LabSceneId } from "./labScene";

/**
 * Dev-only Look Lab (`?lab=1`). Full-screen diorama with a small switcher.
 * URL params: preset (defaults to the scenario's time of day), skin, figures
 * (a|b), quality (high|low), scenario (firstBreach|emberFord), board=stress
 * (14-squad fixture), dpr=<n> (render scale override, for perf checks), cam (wide|close), az/polar/dist (shot overrides), fog=1,
 * deploy=1, select=<squadId>, hover=q,r, ui=0, still=1 (no idle drift), and for stills of an animation:
 * anim=<march|lunge|fall|rout|rally|brace>&animSquad=<id>&animFreeze=<seconds>.
 *
 * Exposes `window.__lookLab = { ready, frames, fps }` for the capture script.
 */

type AnimName = "march" | "lunge" | "fall" | "rout" | "rally" | "brace";
const ANIMS: AnimName[] = ["march", "lunge", "fall", "rout", "rally", "brace"];

type LabState = {
  preset: TimeOfDay;
  skin: string;
  figures: FigureApproach;
  board: LabSceneId;
  cam: "wide" | "close";
  fog: boolean;
  deploy: boolean;
};

declare global {
  interface Window {
    __lookLab?: { ready: boolean; frames: number; fps: number; figuresReady: boolean };
  }
}

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const preset = p.get("preset");
  const figures = p.get("figures");
  const num = (k: string) => (p.get(k) === null ? undefined : Number(p.get(k)));
  const anim = p.get("anim");
  const board: LabSceneId =
    p.get("board") === "stress" ? "stress" : p.get("scenario") === "emberFord" ? "emberFord" : "firstBreach";
  return {
    state: {
      preset: isTimeOfDay(preset) ? preset : LAB_SCENES[board].timeOfDay,
      skin: getSkin(p.get("skin")).id,
      figures: figures === "b" || figures === "kaykit" ? "kaykit" : "toy",
      board,
      cam: p.get("cam") === "close" ? "close" : "wide",
      fog: p.get("fog") === "1",
      deploy: p.get("deploy") === "1",
    } as LabState,
    quality: (p.get("quality") === "low" ? "low" : "high") as RenderQuality,
    ui: p.get("ui") !== "0",
    still: p.get("still") === "1",
    shot: { azimuth: num("az"), polar: num("polar"), distance: num("dist") },
    anim: ANIMS.includes(anim as AnimName) ? (anim as AnimName) : null,
    animSquad: p.get("animSquad"),
    animFreeze: num("animFreeze"),
    select: p.get("select"),
    dpr: num("dpr"),
    hover: p.get("hover"),
  };
}

export function LookLab() {
  const initial = useMemo(readParams, []);
  const [state, setState] = useState<LabState>(initial.state);
  const quality = useAppStore((s) => s.quality);
  const setQuality = useAppStore((s) => s.setQuality);
  const selectedSquadId = useAppStore((s) => s.selectedSquadId);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const [figuresReady, setFiguresReady] = useState(false);
  const animations = useRef<SquadAnimationApi>(null);

  useEffect(() => {
    setQuality(initial.quality);
  }, [initial.quality, setQuality]);

  // Preset picking state from the URL (for captures of the highlights).
  useEffect(() => {
    if (!figuresReady) return;
    const store = useAppStore.getState();
    const squad = LAB_SCENES[state.board].squads.find((s) => s.id === initial.select);
    if (squad) {
      store.selectSquad(squad.id);
      store.selectHex(squad.hex);
    }
    const [q, r] = (initial.hover ?? "").split(",").map(Number);
    if (Number.isFinite(q) && Number.isFinite(r) && initial.hover) store.setHoveredHex({ q, r });
  }, [figuresReady, initial.select, initial.hover, state.board]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set("preset", state.preset);
    p.set("skin", state.skin);
    p.set("figures", state.figures === "kaykit" ? "b" : "a");
    if (state.board === "stress") {
      p.set("board", "stress");
      p.delete("scenario");
    } else {
      p.set("scenario", state.board);
      p.delete("board");
    }
    p.set("cam", state.cam);
    p.set("quality", quality);
    for (const flag of ["fog", "deploy"] as const) {
      if (state[flag]) p.set(flag, "1");
      else p.delete(flag);
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }, [state, quality]);

  useEffect(() => {
    setFiguresReady(false);
    clearSelection();
  }, [state.figures, state.board, clearSelection]);

  const scene = LAB_SCENES[state.board];
  const skin = getSkin(state.skin);
  const shot = useMemo<CameraShot>(() => {
    const base = state.cam === "close" ? closeShot(scene.focus) : wideShot(boardRadius(scene.board));
    return {
      ...base,
      azimuth: initial.shot.azimuth ?? base.azimuth,
      polar: initial.shot.polar ?? base.polar,
      distance: initial.shot.distance ?? base.distance,
    };
  }, [state.cam, scene, initial.shot]);
  const onFiguresReady = useCallback(() => setFiguresReady(true), []);

  const targetSquad = selectedSquadId ?? scene.squads.find((s) => s.faction === "free_banners")?.id ?? null;
  const play = useCallback(
    (name: AnimName, squadId: string | null) => {
      const api = animations.current;
      const squad = scene.squads.find((s) => s.id === squadId);
      if (!api || !squad) return Promise.resolve();
      const occupied = new Set(scene.squads.map((s) => hexKey(s.hex)));
      const step1 = stepToward(squad.hex, squad.facing, scene.board, occupied);
      switch (name) {
        case "march": {
          if (!step1) return Promise.resolve();
          const step2 = stepToward(step1, squad.facing, scene.board, occupied);
          return api.march(squad.id, step2 ? [step1, step2] : [step1]);
        }
        case "lunge":
          return step1 ? api.lunge(squad.id, step1) : Promise.resolve();
        case "fall":
          return api.fall(squad.id, 2);
        case "rout":
          return api.rout(squad.id);
        case "rally":
          return api.rally(squad.id);
        case "brace":
          return api.brace(squad.id);
      }
    },
    [scene],
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d0c12" }}>
      <Canvas
        shadows="soft"
        dpr={initial.dpr ?? (quality === "high" ? [1, 2] : 1)}
        camera={{ fov: 30, near: 0.1, far: 200, position: [0, 10, 14] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        onPointerMissed={() => clearSelection()}
      >
        <LookProvider skin={skin} timeOfDay={state.preset}>
          <DioramaCamera shot={shot} drift={!initial.still} />
          <Diorama
            key={state.board}
            board={scene.board}
            squads={scene.squads}
            figures={state.figures}
            mistDensity={state.fog ? scene.fogDemo : undefined}
            deploymentHexes={state.deploy ? scene.deployment : undefined}
            animationRef={animations}
            onFiguresReady={onFiguresReady}
          />
          <PostFX />
          <FrameProbe figuresReady={figuresReady} />
          {initial.anim && figuresReady && (
            <AutoAnimation
              run={() => play(initial.anim!, initial.animSquad ?? targetSquad)}
              freezeAt={initial.animFreeze}
              animator={animations}
            />
          )}
        </LookProvider>
      </Canvas>
      {initial.ui && (
        <>
          <Stats className="look-lab-stats" />
          <LabPanel
            state={state}
            quality={quality}
            targetSquad={targetSquad}
            onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            onQuality={setQuality}
            onAnim={(name) => void play(name, targetSquad)}
            onReset={() => animations.current?.reset()}
          />
        </>
      )}
    </div>
  );
}

/** Starts one animation shortly after load and optionally freezes it mid-way. */
function AutoAnimation({
  run,
  freezeAt,
  animator,
}: {
  run: () => Promise<void>;
  freezeAt?: number;
  animator: React.RefObject<SquadAnimationApi | null>;
}) {
  const started = useRef<number | null>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (started.current === null) {
      started.current = t;
      void run();
    } else if (freezeAt !== undefined && t - started.current >= freezeAt) {
      (animator.current as SquadAnimator | null)!.timeScale = 0;
    }
  });
  return null;
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
  width: 236,
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

function Chip({ active = false, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
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
  targetSquad,
  onChange,
  onQuality,
  onAnim,
  onReset,
}: {
  state: LabState;
  quality: RenderQuality;
  targetSquad: string | null;
  onChange: (patch: Partial<LabState>) => void;
  onQuality: (q: RenderQuality) => void;
  onAnim: (name: AnimName) => void;
  onReset: () => void;
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
      <span style={label}>Board · Figures</span>
      <Chip active={state.board === "firstBreach"} onClick={() => onChange({ board: "firstBreach", preset: LAB_SCENES.firstBreach.timeOfDay })}>
        First Breach
      </Chip>
      <Chip active={state.board === "emberFord"} onClick={() => onChange({ board: "emberFord", preset: LAB_SCENES.emberFord.timeOfDay })}>
        Ember Ford
      </Chip>
      <Chip active={state.board === "stress"} onClick={() => onChange({ board: "stress" })}>
        14 squads
      </Chip>
      <Chip active={state.figures === "toy"} onClick={() => onChange({ figures: "toy" })}>
        (a) Toy
      </Chip>
      <Chip active={state.figures === "kaykit"} onClick={() => onChange({ figures: "kaykit" })}>
        (b) KayKit
      </Chip>
      <span style={label}>Camera · Quality · Overlays</span>
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
        Fog
      </Chip>
      <Chip active={state.deploy} onClick={() => onChange({ deploy: !state.deploy })}>
        Deploy zone
      </Chip>
      <span style={label}>Animate · {targetSquad ?? "click a squad"}</span>
      {ANIMS.map((name) => (
        <Chip key={name} onClick={() => onAnim(name)}>
          {name}
        </Chip>
      ))}
      <Chip onClick={onReset}>reset</Chip>
    </div>
  );
}
