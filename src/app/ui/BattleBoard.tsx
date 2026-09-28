// The one place the app mounts the Diorama. Everything the renderer draws comes from
// the player's visibleState via the renderer's own mappers (src/render/fromEngine.ts).
// Weather/fog props (T08) and the playback animationRef (T06) plug in here.
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { useAmbience } from "../../audio";
import type { SquadAnimationApi } from "../../render/figures/squadAnimation";
import { DioramaCamera, wideShotFor } from "../../render/camera/DioramaCamera";
import { Diorama } from "../../render/Diorama";
import { lightingFor, visibilityFromView, weatherFor } from "../../render/fromEngine";
import { timeOfDayAt } from "../../game/engine";
import { LookProvider } from "../../render/look/LookContext";
import { PostFX } from "../../render/post/PostFX";
import { useCanvasDpr } from "../../render/quality";
import { emberDusk } from "../../render/skins";
import { deploymentHexes } from "../game/deploy";
import { hasStageTurn } from "../game/goal";
import { useGame, useShownView } from "../game/gameStore";
import { toDioramaSquads } from "../game/view";
import { useAppStore } from "../store";
import { FrameProbe } from "./FrameProbe";
import { usePrefersReducedMotion } from "./motion";
import { PlaybackStage } from "./PlaybackStage";

export function BattleBoard({
  still = false,
  animationRef,
}: {
  still?: boolean;
  /** The squad animator, for the playback director (T06). */
  animationRef?: RefObject<SquadAnimationApi | null>;
}) {
  const scenario = useGame((s) => s.scenario);
  // During playback this is the director's layer, so squads move as the phase plays.
  const view = useShownView();
  const stage = useGame((s) => s.stage);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const dpr = useCanvasDpr();
  const [figuresReady, setFiguresReady] = useState(false);
  const onFiguresReady = useCallback(() => setFiguresReady(true), []);

  const squads = useMemo(() => toDioramaSquads(view), [view]);
  const zone = useMemo(() => (stage === "deploy" ? deploymentHexes(scenario) : undefined), [stage, scenario]);
  // Tighter, Banner-biased framing on the big boards; the classic shot elsewhere.
  const shot = useMemo(() => wideShotFor(scenario.board), [scenario.board]);
  // Reduced motion: no idle camera drift. (Embers, water and fire shimmer are render-owned; see T08.)
  const reducedMotion = usePrefersReducedMotion();
  // The hour of the phase on show. (The engine's state.timeOfDay only turns when a phase
  // resolves, so the orders window of a new hour, e.g. Hold for Dawn's sunrise, would
  // otherwise still be lit for the old one.)
  const hour = timeOfDayAt(scenario, Math.min(view.phase, view.maxPhases));
  // A battle whose goal turns with the hour (Hold for Dawn) fades its light in ~2 s, so
  // sunrise and the hide burn land inside the 2.6 s dawn moment (R2). Elsewhere, the default.
  const dawnFade = useMemo(() => (hasStageTurn(scenario) ? 2 : undefined), [scenario]);
  // The player's escape edge, marked on the board (R3): Saltmarsh's southern exit row.
  const exitHexes = scenario.winCondition.kind === "escapeEdge" ? scenario.winCondition.edgeHexes : undefined;
  const shaking = useGateShake(reducedMotion);
  const water = useMemo(() => scenario.board.hexes.some((hex) => hex.terrain === "river" || hex.terrain === "ford"), [scenario.board]);
  useAmbience({
    timeOfDay: lightingFor(hour),
    weather: weatherFor(view.weather),
    water,
    hostDrums: view.squads.some((squad) => squad.faction !== view.viewer && squad.status === "active"),
  });
  // T08 fog of war: the renderer's adapter over the same filtered view.
  const visibility = useMemo(() => visibilityFromView(view, scenario), [view, scenario]);
  return (
    <div className={`board ${shaking ? "shake" : ""}`} aria-hidden="true">
      <Canvas
        shadows="soft"
        dpr={dpr}
        camera={{ fov: 30, near: 0.1, far: 200, position: [0, 10, 14] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        onPointerMissed={() => clearSelection()}
      >
        <LookProvider skin={emberDusk} timeOfDay={lightingFor(hour)} weather={weatherFor(view.weather)} timeOfDayFade={dawnFade}>
          <DioramaCamera shot={shot} drift={!still && !reducedMotion} />
          <Diorama
            key={scenario.id}
            board={scenario.board}
            squads={squads}
            deploymentHexes={zone}
            exitHexes={exitHexes}
            visibility={visibility}
            animationRef={animationRef}
            onFiguresReady={onFiguresReady}
          />
          <PlaybackStage board={scenario.board} shot={shot} reducedMotion={reducedMotion} />
          <PostFX />
          <FrameProbe ready={figuresReady} />
        </LookProvider>
      </Canvas>
    </div>
  );
}

/** A short board shake when the gate is struck (never under reduced motion). */
function useGateShake(reducedMotion: boolean) {
  const shakeAt = useGame((s) => s.shakeAt);
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (!shakeAt || reducedMotion) return undefined;
    setShaking(true);
    const timer = setTimeout(() => setShaking(false), 380);
    return () => clearTimeout(timer);
  }, [shakeAt, reducedMotion]);
  return shaking;
}
