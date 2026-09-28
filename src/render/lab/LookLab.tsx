import { Stats } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAudioStore } from "../../app/audioStore";
import { useCaptureStore } from "../../app/captureStore";
import { useAppStore, type RenderQuality } from "../../app/store";
import { emberFord } from "../../game/engine/scenarios/emberFord";
import { firstBreach } from "../../game/engine/scenarios/firstBreach";
import { holdForDawn } from "../../game/engine/scenarios/holdForDawn";
import { saltmarshColumn } from "../../game/engine/scenarios/saltmarshColumn";
import { cinematicPaths, type CinematicPathId } from "../camera/cameraPath";
import { CinematicCamera } from "../camera/CinematicCamera";
import { CampaignMap, type CampaignMapBattle } from "../showcase/CampaignMap";
import { TitleScene } from "../showcase/TitleScene";
import { playSfx, SFX_NAMES, useAmbience } from "../../audio";
import { hexKey } from "../../game/board";
import { closeShot, DioramaCamera, wideShot, type CameraShot } from "../camera/DioramaCamera";
import { Diorama } from "../Diorama";
import type { SquadAnimationApi, SquadAnimator } from "../figures/squadAnimation";
import type { FigureApproach } from "../figures/types";
import { boardCenter, boardRadius, hexToWorld } from "../hexWorld";
import { LookProvider, useLook } from "../look/LookContext";
import { canvasDpr } from "../quality";
import { PostFX } from "../post/PostFX";
import { getSkin, isTimeOfDay, SKINS, TIME_OF_DAY_KEYS, WEATHER_KINDS, type TimeOfDay, type WeatherKind } from "../skins";
import { fogOfWar, LAB_SCENES, stepToward, type LabSceneId } from "./labScene";

/**
 * Dev-only Look Lab (`?lab=1`). Full-screen diorama with a small switcher.
 * URL params: preset (defaults to the scenario's time of day), skin, figures
 * (a|b), quality (high|low), scenario (firstBreach|emberFord), board=stress
 * (14-squad fixture), weather (clear|rain|mist|ashWind), dpr=<n> (render
 * scale override; 2 = "ultra"), cam (wide|close), az/polar/dist (shot
 * overrides), fog=1 (fog of war, Banners' view) or fog=reveal (&revealAt=<s>
 * &fogFreeze=<s> for stills of the enemy emerging from the mist),
 * deploy=1, select=<squadId>, hover=q,r, ui=0, still=1 (no idle drift), and for stills of an animation:
 * anim=<march|lunge|fall|rout|rally|brace>&animSquad=<id>&animFreeze=<seconds>.
 *
 * Showcase (T13): view=title | campaign (&campaignMock=a|b), path=<craneInGate|
 * bannerDolly|riverPush|titleFlyover> (cinematic camera), seq=1 (frameloop
 * "never"; the capture script steps time via window.__lookLabAdvance(t)),
 * capture=1 (hide every panel).
 *
 * Exposes `window.__lookLab = { ready, frames, fps }` for the capture script.
 */

type AnimName = "march" | "lunge" | "fall" | "rout" | "rally" | "brace" | "shake";
const ANIMS: AnimName[] = ["march", "lunge", "fall", "rout", "rally", "brace", "shake"];

type LabState = {
  preset: TimeOfDay;
  skin: string;
  figures: FigureApproach;
  board: LabSceneId;
  cam: "wide" | "close";
  fog: "off" | "on" | "reveal";
  weather: WeatherKind;
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
  const scenarioParam = p.get("scenario");
  const board: LabSceneId =
    p.get("board") === "stress"
      ? "stress"
      : scenarioParam === "emberFord" || scenarioParam === "saltmarsh" || scenarioParam === "holdForDawn"
        ? scenarioParam
        : "firstBreach";
  return {
    state: {
      preset: isTimeOfDay(preset) ? preset : LAB_SCENES[board].timeOfDay,
      skin: getSkin(p.get("skin")).id,
      figures: figures === "b" || figures === "kaykit" ? "kaykit" : "toy",
      board,
      cam: p.get("cam") === "close" ? "close" : "wide",
      fog: p.get("fog") === "reveal" ? "reveal" : p.get("fog") === "1" ? "on" : "off",
      weather: (WEATHER_KINDS as string[]).includes(p.get("weather") ?? "") ? (p.get("weather") as WeatherKind) : "clear",
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
    revealAt: num("revealAt") ?? 2,
    view: (p.get("view") ?? "diorama") as "diorama" | "title" | "campaign",
    campaignMock: p.get("campaignMock") === "b" ? "b" : "a",
    path: p.get("path") as CinematicPathId | null,
    seq: p.get("seq") === "1",
    fadeTo: isTimeOfDay(p.get("fadeTo")) ? (p.get("fadeTo") as TimeOfDay) : null,
    fadeAt: num("fadeAt") ?? 1,
    focusHex: p.get("focusHex"),
    fogFreeze: num("fogFreeze"),
  };
}

export function LookLab() {
  const initial = useMemo(readParams, []);
  if (initial.view === "title") return <TitleLab seq={initial.seq} />;
  if (initial.view === "campaign") return <CampaignLab seq={initial.seq} mock={initial.campaignMock as "a" | "b"} />;
  return <DioramaLab initial={initial} />;
}

/** Probes shared by every lab view: readiness for the capture script, and frame stepping. */
function LabProbes({ ready, seq }: { ready: boolean; seq: boolean }) {
  return (
    <>
      <FrameProbe figuresReady={ready} />
      {seq && <SequenceDriver />}
    </>
  );
}

/** Exposes R3F's `advance(t)` so the capture script can step deterministic frames. */
function SequenceDriver() {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    (window as unknown as { __lookLabAdvance?: (t: number) => void }).__lookLabAdvance = (t: number) => advance(t);
    return () => {
      delete (window as unknown as { __lookLabAdvance?: unknown }).__lookLabAdvance;
    };
  }, [advance]);
  return null;
}

function TitleLab({ seq }: { seq: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <TitleScene frameloop={seq ? "never" : "always"} inCanvas={<LabProbes ready seq={seq} />}>
        <div style={{ display: "flex", gap: 14 }}>
          {["Begin the Campaign", "Continue", "Settings"].map((label) => (
            <span key={label} style={menuButton}>
              {label}
            </span>
          ))}
        </div>
      </TitleScene>
    </div>
  );
}

const menuButton: CSSProperties = {
  padding: "10px 22px",
  border: "1px solid rgba(212,166,74,0.7)",
  background: "rgba(20,16,22,0.72)",
  color: "#efe3c8",
  font: "600 15px/1 Cinzel, Georgia, serif",
  letterSpacing: "0.1em",
  borderRadius: 3,
};

/** Mock campaign states so every island status can be captured. */
const CAMPAIGN_MOCKS: Record<"a" | "b", CampaignMapBattle[]> = {
  a: [
    { id: "tutorial", title: "The First Breach", timeOfDay: "dusk", status: "won", board: firstBreach.board },
    { id: "battle_1", title: "Ember Ford", timeOfDay: "nightFires", status: "current", board: emberFord.board },
    { id: "battle_2", title: "The Saltmarsh Column", timeOfDay: "rainGrey", status: "locked", board: saltmarshColumn.board },
    { id: "battle_3", title: "Hold for Dawn", timeOfDay: "predawn", status: "locked", board: holdForDawn.board },
  ],
  b: [
    { id: "tutorial", title: "The First Breach", timeOfDay: "dusk", status: "won", board: firstBreach.board },
    { id: "battle_1", title: "Ember Ford", timeOfDay: "nightFires", status: "stalemate", board: emberFord.board },
    { id: "battle_2", title: "The Saltmarsh Column", timeOfDay: "rainGrey", status: "lost", board: saltmarshColumn.board },
    { id: "battle_3", title: "Hold for Dawn", timeOfDay: "predawn", status: "current", board: holdForDawn.board },
  ],
};

function CampaignLab({ seq, mock }: { seq: boolean; mock: "a" | "b" }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(() => new URLSearchParams(window.location.search).get("focus"));
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <CampaignMap
        battles={CAMPAIGN_MOCKS[mock]}
        onSelect={setPicked}
        focusedId={focus}
        onFocusChange={setFocus}
        frameloop={seq ? "never" : "always"}
        inCanvas={<LabProbes ready seq={seq} />}
      >
        {picked && <div style={{ ...panel, top: "auto", bottom: 12, right: "auto", left: 12 }}>Selected: {picked}</div>}
      </CampaignMap>
    </div>
  );
}

function DioramaLab({ initial }: { initial: ReturnType<typeof readParams> }) {
  const [state, setState] = useState<LabState>(initial.state);
  const quality = useAppStore((s) => s.quality);
  const setQuality = useAppStore((s) => s.setQuality);
  const captureMode = useCaptureStore((s) => s.captureMode);
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
    if (state.deploy) p.set("deploy", "1");
    else p.delete("deploy");
    if (state.fog === "off") p.delete("fog");
    else p.set("fog", state.fog === "on" ? "1" : "reveal");
    if (state.weather === "clear") p.delete("weather");
    else p.set("weather", state.weather);
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }, [state, quality]);

  useEffect(() => {
    setFiguresReady(false);
    clearSelection();
  }, [state.figures, state.board, clearSelection]);

  const scene = LAB_SCENES[state.board];
  const skin = getSkin(state.skin);
  const shot = useMemo<CameraShot>(() => {
    const [fq, fr] = (initial.focusHex ?? "").split(",").map(Number);
    const focus: [number, number, number] =
      initial.focusHex && Number.isFinite(fq) && Number.isFinite(fr)
        ? (() => {
            const [x, z] = hexToWorld({ q: fq, r: fr }, boardCenter(scene.board));
            return [x + 0.9, 0.4, z + 0.6] as [number, number, number];
          })()
        : scene.focus;
    const base = state.cam === "close" ? closeShot(focus) : wideShot(boardRadius(scene.board));
    return {
      ...base,
      azimuth: initial.shot.azimuth ?? base.azimuth,
      polar: initial.shot.polar ?? base.polar,
      distance: initial.shot.distance ?? base.distance,
    };
  }, [state.cam, scene, initial.shot]);
  const onFiguresReady = useCallback(() => setFiguresReady(true), []);
  const cinematic = useMemo(() => (initial.path ? (cinematicPaths(scene.board)[initial.path] ?? null) : null), [initial.path, scene.board]);

  // Fog of war: "on" = the Banners see 2 hexes; "reveal" starts at 1 and, after
  // `revealAt` seconds, widens to 3 so Host squads emerge from the mist.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [state.fog, state.board]);
  const fog = useMemo(() => {
    if (state.fog === "off") return null;
    return fogOfWar(scene, state.fog === "on" ? 2 : revealed ? 3 : 1);
  }, [scene, state.fog, revealed]);
  const onReveal = useCallback(() => playSfx("reveal"), []);

  useAmbience({
    timeOfDay: state.preset,
    weather: state.weather,
    water: scene.board.hexes.some((h) => h.terrain === "ford" || h.terrain === "river"),
    hostDrums: true,
  });

  const targetSquad = selectedSquadId ?? scene.squads.find((s) => s.faction === "free_banners")?.id ?? null;
  const play = useCallback(
    (name: AnimName, squadId: string | null) => {
      const api = animations.current;
      if (api && name === "shake") {
        const objective = scene.board.hexes.find((h) => h.objectiveId) ?? scene.board.hexes.find((h) => h.terrain === "wall");
        return objective ? api.shakeObjective(objective.coord, 1) : Promise.resolve();
      }
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
        case "shake": {
          const objective = scene.board.hexes.find((h) => h.objectiveId) ?? scene.board.hexes.find((h) => h.terrain === "wall");
          return objective ? api.shakeObjective(objective.coord, 1) : Promise.resolve();
        }
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
        frameloop={initial.seq ? "never" : "always"}
        dpr={initial.dpr ?? canvasDpr(quality)}
        camera={{ fov: 30, near: 0.1, far: 200, position: [0, 10, 14] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        onPointerMissed={() => clearSelection()}
      >
        <LookProvider skin={skin} timeOfDay={state.preset} weather={state.weather}>
          {cinematic ? (
            <CinematicCamera path={cinematic} />
          ) : (
            <DioramaCamera shot={shot} drift={!initial.still} />
          )}
          <Diorama
            key={state.board}
            board={scene.board}
            squads={fog ? fog.squads : scene.squads}
            visibility={fog?.visibility}
            onReveal={onReveal}
            figures={state.figures}
            deploymentHexes={state.deploy ? scene.deployment : undefined}
            animationRef={animations}
            onFiguresReady={onFiguresReady}
          />
          <PostFX />
          <LabProbes ready={figuresReady} seq={initial.seq} />
          <AtmosphereFreezer />
          {state.fog === "reveal" && figuresReady && !revealed && (
            <After seconds={initial.revealAt} run={() => setRevealed(true)} />
          )}
          {revealed && initial.fogFreeze !== undefined && (
            <After seconds={initial.fogFreeze} run={() => freezeAll(animations.current)} />
          )}
          {initial.fadeTo && figuresReady && (
            <After seconds={initial.fadeAt} run={() => setState((st) => ({ ...st, preset: initial.fadeTo! }))} />
          )}
          {initial.anim && figuresReady && (
            <AutoAnimation
              run={() => play(initial.anim!, initial.animSquad ?? targetSquad)}
              freezeAt={initial.animFreeze}
              animator={animations}
            />
          )}
        </LookProvider>
      </Canvas>
      {initial.ui && !captureMode && (
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
            onReveal={() => {
              setState((s) => ({ ...s, fog: "reveal" }));
              setRevealed(false);
            }}
          />
          <AudioPanel />
        </>
      )}
    </div>
  );
}

/** Runs a callback once, `seconds` after mounting (scene time). */
function After({ seconds, run }: { seconds: number; run: () => void }) {
  const start = useRef<number | null>(null);
  const done = useRef(false);
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    if (!done.current && clock.elapsedTime - start.current >= seconds) {
      done.current = true;
      run();
    }
  });
  return null;
}

/** Freeze every tween (figures, weather, fog) for a still; set from inside the scene. */
let freezeAtmosphere: (() => void) | null = null;
function freezeAll(animator: SquadAnimationApi | null) {
  animator?.pause();
  freezeAtmosphere?.();
}
function AtmosphereFreezer() {
  const { atmosphere } = useLook();
  useEffect(() => {
    freezeAtmosphere = () => {
      atmosphere.timeScale = 0;
    };
    return () => {
      freezeAtmosphere = null;
    };
  }, [atmosphere]);
  return null;
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
      animator.current?.pause();
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
  onReveal,
}: {
  state: LabState;
  quality: RenderQuality;
  targetSquad: string | null;
  onChange: (patch: Partial<LabState>) => void;
  onQuality: (q: RenderQuality) => void;
  onAnim: (name: AnimName) => void;
  onReset: () => void;
  onReveal: () => void;
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
      <span style={label}>Weather</span>
      {WEATHER_KINDS.map((w) => (
        <Chip key={w} active={state.weather === w} onClick={() => onChange({ weather: w })}>
          {skin.weather[w].label}
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
      <Chip active={state.fog !== "off"} onClick={() => onChange({ fog: state.fog === "off" ? "on" : "off" })}>
        Fog of war
      </Chip>
      <Chip onClick={onReveal}>Reveal ▸</Chip>
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

function AudioPanel() {
  const muted = useAudioStore((s) => s.muted);
  const volume = useAudioStore((s) => s.volume);
  const toggleMuted = useAudioStore((s) => s.toggleMuted);
  const setVolume = useAudioStore((s) => s.setVolume);
  return (
    <div style={{ ...panel, top: "auto", bottom: 12, width: 236 }}>
      <span style={{ ...label, marginTop: 0 }}>Audio (click anywhere to start)</span>
      <Chip active={!muted} onClick={toggleMuted}>
        {muted ? "Muted" : "Sound on"}
      </Chip>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        style={{ width: 110, verticalAlign: "middle" }}
        aria-label="Volume"
      />
      <div style={{ marginTop: 6 }}>
        {SFX_NAMES.map((name) => (
          <Chip key={name} onClick={() => playSfx(name)}>
            {name}
          </Chip>
        ))}
      </div>
    </div>
  );
}
