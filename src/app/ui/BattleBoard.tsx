// The one place the app mounts the Diorama. Everything the renderer draws comes from
// the player's visibleState via the renderer's own mappers (src/render/fromEngine.ts).
// Weather/fog props (T08) and the playback animationRef (T06) plug in here.
import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import { DioramaCamera, wideShot } from "../../render/camera/DioramaCamera";
import { Diorama } from "../../render/Diorama";
import { lightingFor } from "../../render/fromEngine";
import { boardRadius } from "../../render/hexWorld";
import { LookProvider } from "../../render/look/LookContext";
import { PostFX } from "../../render/post/PostFX";
import { emberDusk } from "../../render/skins";
import { deploymentHexes } from "../game/deploy";
import { useGame } from "../game/gameStore";
import { toDioramaSquads } from "../game/view";
import { useAppStore } from "../store";

declare global {
  interface Window {
    /** Read by scripts/capture-app.mjs to know when the scene has settled. */
    __battleBoard?: { ready: boolean; frames: number };
  }
}

export function BattleBoard({ still = false }: { still?: boolean }) {
  const scenario = useGame((s) => s.scenario);
  const view = useGame((s) => s.view);
  const stage = useGame((s) => s.stage);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const [figuresReady, setFiguresReady] = useState(false);
  const onFiguresReady = useCallback(() => setFiguresReady(true), []);

  const squads = useMemo(() => toDioramaSquads(view), [view]);
  const zone = useMemo(() => (stage === "deploy" ? deploymentHexes(scenario) : undefined), [stage, scenario]);
  const shot = useMemo(() => wideShot(boardRadius(scenario.board)), [scenario.board]);
  return (
    <div className="board" aria-hidden="true">
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 200, position: [0, 10, 14] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        onPointerMissed={() => clearSelection()}
      >
        <LookProvider skin={emberDusk} timeOfDay={lightingFor(scenario.timeOfDay)}>
          <DioramaCamera shot={shot} drift={!still} />
          <Diorama
            key={scenario.id}
            board={scenario.board}
            squads={squads}
            deploymentHexes={zone}
            onFiguresReady={onFiguresReady}
          />
          <PostFX />
          <FrameProbe ready={figuresReady} />
        </LookProvider>
      </Canvas>
    </div>
  );
}

function FrameProbe({ ready }: { ready: boolean }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    window.__battleBoard = { ready: ready && frames.current > 90, frames: frames.current };
  });
  return null;
}
