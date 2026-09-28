import { useRef } from "react";
import { useGame } from "./app/game/gameStore";
import { BattleBoard } from "./app/ui/BattleBoard";
import { Briefing } from "./app/ui/Briefing";
import { CommandBar } from "./app/ui/CommandBar";
import { DeployBar } from "./app/ui/DeployBar";
import { DoctrineHand, type HandHandle } from "./app/ui/DoctrineHand";
import { Inspector } from "./app/ui/Inspector";
import { Outcome } from "./app/ui/Outcome";
import { PhaseReport } from "./app/ui/PhaseReport";
import { Roster } from "./app/ui/Roster";
import { SealOrders } from "./app/ui/SealOrders";
import { useBoardDeployment } from "./app/ui/useBoardDeployment";

/**
 * The command shell: the diorama full-bleed, with the command UI laid over it.
 * Which overlays show depends only on the game store's stage.
 */
function App({ still = false }: { still?: boolean }) {
  const stage = useGame((s) => s.stage);
  const hand = useRef<HandHandle>(null);
  useBoardDeployment();

  return (
    <div className={`shell stage-${stage}`}>
      <BattleBoard still={still} />
      {stage === "briefing" ? (
        <Briefing />
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
          {stage === "report" && <PhaseReport />}
          {stage === "outcome" && <Outcome />}
        </main>
      )}
    </div>
  );
}

export default App;
