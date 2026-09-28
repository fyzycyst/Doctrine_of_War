// The one place the app mounts the Diorama. Everything the renderer draws comes from
// the player's visibleState via the renderer's own mappers (src/render/fromEngine.ts).
// Weather/fog props (T08) and the playback animationRef (T06) plug in here.
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { useAmbience } from "../../audio";
import type { SquadAnimationApi } from "../../render/figures/squadAnimation";
import { DioramaCamera, wideShot } from "../../render/camera/DioramaCamera";
import { Diorama } from "../../render/Diorama";
import { lightingFor, visibilityFromView, weatherFor } from "../../render/fromEngine";
import { boardRadius } from "../../render/hexWorld";
import { LookProvider } from "../../render/look/LookContext";
import { PostFX } from "../../render/post/PostFX";
import { canvasDpr } from "../../render/quality";
import { emberDusk } from "../../render/skins";
import { deploymentHexes } from "../game/deploy";
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
  const quality = useAppStore((s) => s.quality);
  const [figuresReady, setFiguresReady] = useState(false);
  const onFiguresReady = useCallback(() => setFiguresReady(true), []);

  const squads = useMemo(() => toDioramaSquads(view), [view]);
  const zone = useMemo(() => (stage === "deploy" ? deploymentHexes(scenario) : undefined), [stage, scenario]);
  const shot = useMemo(() => wideShot(boardRadius(scenario.board)), [scenario.board]);
  // Reduced motion: no idle camera drift. (Embers, water and fire shimmer are render-owned; see T08.)
  const reducedMotion = usePrefersReducedMotion();
  const shaking = useGateShake(reducedMotion);
  const water = useMemo(() => scenario.board.hexes.some((hex) => hex.terrain === "river" || hex.terrain === "ford"), [scenario.board]);
  useAmbience({
    timeOfDay: lightingFor(scenario.timeOfDay),
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
        dpr={canvasDpr(quality)}
        camera={{ fov: 30, near: 0.1, far: 200, position: [0, 10, 14] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        onPointerMissed={() => clearSelection()}
      >
        <LookProvider skin={emberDusk} timeOfDay={lightingFor(scenario.timeOfDay)} weather={weatherFor(view.weather)}>
          <DioramaCamera shot={shot} drift={!still && !reducedMotion} />
          <Diorama
            key={scenario.id}
            board={scenario.board}
            squads={squads}
            deploymentHexes={zone}
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
