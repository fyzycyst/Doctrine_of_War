import { useRef } from "react";
import type { SquadAnimationApi } from "./render/figures/squadAnimation";
import { useGame } from "./app/game/gameStore";
import { BattleBoard } from "./app/ui/BattleBoard";
import { Briefing } from "./app/ui/Briefing";
import { CommandBar } from "./app/ui/CommandBar";
import { DeployBar } from "./app/ui/DeployBar";
import { DoctrineHand, type HandHandle } from "./app/ui/DoctrineHand";
import { Inspector } from "./app/ui/Inspector";
import { Outcome } from "./app/ui/Outcome";
import { PhaseReport } from "./app/ui/PhaseReport";
import { Playback } from "./app/ui/Playback";
import { Roster } from "./app/ui/Roster";
import { SealOrders } from "./app/ui/SealOrders";
import { useBoardDeployment } from "./app/ui/useBoardDeployment";
import { useBoardMuster } from "./app/ui/useMuster";
import { useEscapeDeselects } from "./app/ui/useEscapeDeselects";
import { useCaptureStore } from "./app/captureStore";
import { CoachLayer } from "./app/guide/CoachLayer";
import { MusterTip } from "./app/guide/MusterTip";
import { DoctrineIntro } from "./app/guide/DoctrineIntro";
import { tutorialOn, useGuide } from "./app/guide/guideStore";

/**
 * The command shell: the diorama full-bleed, with the command UI laid over it.
 * Which overlays show depends only on the game store's stage.
 */
function App({ still = false, pauseAt }: { still?: boolean; pauseAt?: string }) {
  const stage = useGame((s) => s.stage);
  const hand = useRef<HandHandle>(null);
  const animation = useRef<SquadAnimationApi | null>(null);
  const captureMode = useCaptureStore((s) => s.captureMode);
  // The player's first battle, by any route (a campaign's or a skirmish), opens with
  // "Standing orders" and the tutorial (T32).
  const showIntro = useGuide((s) => !s.introSeen && tutorialOn(s));
  useBoardDeployment();
  useBoardMuster();
  useEscapeDeselects();

  return (
    <div className={`shell stage-${stage}`}>
      <BattleBoard still={still} animationRef={animation} />
      {captureMode ? (
        // Capture mode: the diorama only. Playback still runs (headless) so battles can be filmed.
        stage === "resolving" && <Playback animation={animation} pauseAt={pauseAt} headless />
      ) : stage === "briefing" ? (
        showIntro ? <DoctrineIntro /> : <Briefing />
      ) : (
        <main className="hud">
          <CommandBar />
          <Roster onOpenHand={() => setTimeout(() => hand.current?.focus())} />
          {(stage === "deploy" || stage === "command") && <Inspector />}
          {stage === "deploy" && <DeployBar />}
          {stage === "command" && (
            <>
              <DoctrineHand ref={hand} />
              <SealOrders />
            </>
          )}
          {stage === "resolving" && <Playback animation={animation} pauseAt={pauseAt} />}
          {stage === "report" && <PhaseReport />}
          <CoachLayer />
          <MusterTip />
          {stage === "outcome" && <Outcome />}
        </main>
      )}
    </div>
  );
}

export default App;
