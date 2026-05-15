import { useMemo, useState } from "react";
import { resolvePhase } from "./game/resolvePhase";
import { createInitialBattleState } from "./game/scenario";
import type { BattleState, DoctrineAssignments } from "./game/types";
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

function App() {
  const [started, setStarted] = useState(false);
  const [state, setState] = useState(() => createInitialBattleState());
  const [assignments, setAssignments] = useState(() => initialAssignments(createInitialBattleState()));
  const latestReport = state.reports.at(-1);
  const squads = useMemo(() => playerSquads(state), [state]);
  const enemies = useMemo(() => hostSquads(state), [state]);
  const terminal = state.status !== "command";

  function updateAssignment(squadId: string, doctrineId: string) {
    setAssignments((current) => ({ ...current, [squadId]: doctrineId }));
  }

  function commitPhase() {
    setState((current) => {
      const next = resolvePhase(current, assignments);
      setAssignments(initialAssignments(next));
      return next;
    });
  }

  function restart() {
    const next = createInitialBattleState();
    setState(next);
    setAssignments(initialAssignments(next));
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
        <Battlefield state={state} assignments={assignments} />
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
