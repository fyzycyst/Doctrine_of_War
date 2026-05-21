import { useMemo, useState } from "react";
import { getHex, sameHex, type HexCoord } from "./game/board";
import { resolvePhase } from "./game/resolvePhase";
import { createInitialBattleState, firstBreachScenario } from "./game/scenario";
import type { BattleState, DoctrineAssignments, Squad } from "./game/types";
import { ActionBar } from "./ui/ActionBar";
import { Battlefield } from "./ui/Battlefield";
import { BattleReportPanel } from "./ui/BattleReportPanel";
import { Briefing } from "./ui/Briefing";
import { DoctrinePanel } from "./ui/DoctrinePanel";
import { ObjectivePanel } from "./ui/ObjectivePanel";

const playerSquads = (state: BattleState) =>
  state.squads.filter((squad) => squad.faction === "free_banners");

const hostSquads = (state: BattleState) =>
  state.squads.filter((squad) => squad.faction === "ashen_host");

function initialAssignments(state: BattleState): DoctrineAssignments {
  return Object.fromEntries(playerSquads(state).map((squad) => [squad.id, squad.assignedDoctrineId]));
}

function canDeploySquad(squad: Squad, squads: Squad[], coord: HexCoord) {
  const board = firstBreachScenario.board;
  const hex = board ? getHex(board, coord) : undefined;
  const occupied = squads.some((item) => item.id !== squad.id && item.hex && sameHex(item.hex, coord));

  return Boolean(
    board &&
      hex &&
      !occupied &&
      !hex.objectiveId &&
      squad.faction === firstBreachScenario.playerFaction &&
      hex.deploymentFaction === firstBreachScenario.playerFaction,
  );
}

function App() {
  const [started, setStarted] = useState(false);
  const [state, setState] = useState(() => createInitialBattleState());
  const [assignments, setAssignments] = useState(() => initialAssignments(createInitialBattleState()));
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const latestReport = state.reports.at(-1);
  const squads = useMemo(() => playerSquads(state), [state]);
  const enemies = useMemo(() => hostSquads(state), [state]);
  const terminal = state.status !== "command";
  const deploymentLocked = terminal || state.currentPhase !== 1 || state.reports.length > 0;

  function updateAssignment(squadId: string, doctrineId: string) {
    setAssignments((current) => ({ ...current, [squadId]: doctrineId }));
  }

  function commitPhase() {
    setState((current) => {
      const next = resolvePhase(current, assignments);
      setAssignments(initialAssignments(next));
      setSelectedSquadId(null);
      return next;
    });
  }

  function deploySquad(squadId: string, coord: HexCoord) {
    if (deploymentLocked) {
      return;
    }

    setState((current) => {
      const squad = current.squads.find((item) => item.id === squadId);

      if (!squad || !canDeploySquad(squad, current.squads, coord)) {
        return current;
      }

      return {
        ...current,
        squads: current.squads.map((item) => (item.id === squadId ? { ...item, hex: { ...coord } } : item)),
      };
    });
  }

  function restart() {
    const next = createInitialBattleState();
    setState(next);
    setAssignments(initialAssignments(next));
    setSelectedSquadId(null);
    setStarted(false);
  }

  if (!started) {
    return (
      <main className="app app-centered">
        <Briefing onBegin={() => setStarted(true)} />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p>Doctrine of War: Ash & Banner</p>
          <h1>The First Breach</h1>
        </div>
        <div className={`status-pill ${state.status}`}>
          {state.status === "victory" ? "Scenario Victory" : state.status === "defeat" ? "Scenario Defeat" : "Command"}
        </div>
      </header>
      <div className="layout">
        <DoctrinePanel squads={squads} assignments={assignments} onChange={updateAssignment} disabled={terminal} />
        <Battlefield
          state={state}
          assignments={assignments}
          selectedSquadId={selectedSquadId}
          deploymentLocked={deploymentLocked}
          onSelectSquad={setSelectedSquadId}
          onDeploySquad={deploySquad}
        />
        <aside className="right-rail">
          <ObjectivePanel playerSquads={squads} hostSquads={enemies} />
          <BattleReportPanel report={latestReport} />
          <ActionBar onCommit={commitPhase} onRestart={restart} disabled={terminal} />
        </aside>
      </div>
    </main>
  );
}

export default App;
