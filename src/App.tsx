import { Flag, RotateCcw, Shield, Swords } from "lucide-react";
import { useMemo, useState } from "react";
import { resolvePhase } from "./game/resolvePhase";
import { createInitialBattleState, firstBreachScenario } from "./game/scenario";
import type { BattleReport, BattleState, DoctrineAssignments } from "./game/types";
import { Battlefield } from "./ui/Battlefield";
import { DoctrinePanel } from "./ui/DoctrinePanel";

const playerSquads = (state: BattleState) =>
  state.squads.filter((squad) => squad.faction === "free_banners");

const hostSquads = (state: BattleState) =>
  state.squads.filter((squad) => squad.faction === "ashen_host");

function initialAssignments(state: BattleState): DoctrineAssignments {
  return Object.fromEntries(playerSquads(state).map((squad) => [squad.id, squad.assignedDoctrineId]));
}

function Briefing({ onBegin }: { onBegin: () => void }) {
  return (
    <section className="briefing" aria-labelledby="briefing-title">
      <div>
        <p className="kicker">Doctrine of War: Ash & Banner</p>
        <h1 id="briefing-title">The First Breach</h1>
        <p className="briefing-copy">{firstBreachScenario.briefing}</p>
        <div className="briefing-grid">
          <div>
            <Shield aria-hidden="true" />
            <strong>You command the Free Banners.</strong>
            <span>Assign standing orders, preserve cohesion, and hold Greyford Gate.</span>
          </div>
          <div>
            <Swords aria-hidden="true" />
            <strong>The Ashen Host moves first.</strong>
            <span>Each phase begins with scripted pressure that your doctrines must answer.</span>
          </div>
          <div>
            <Flag aria-hidden="true" />
            <strong>Hold until dawn.</strong>
            <span>Survive three phases with the gate intact to win the tutorial.</span>
          </div>
        </div>
      </div>
      <button className="primary-action" type="button" onClick={onBegin}>
        Begin Command
      </button>
    </section>
  );
}

function BattleReportPanel({ report }: { report?: BattleReport }) {
  if (!report) {
    return (
      <section className="panel report-panel" aria-labelledby="report-title">
        <div className="panel-heading">
          <span>Battle Report</span>
          <h2 id="report-title">Awaiting First Clash</h2>
        </div>
        <p className="empty-report">Commit orders to see casualties, cohesion, objective progress, and command notes.</p>
      </section>
    );
  }

  return (
    <section className="panel report-panel" aria-labelledby="report-title">
      <div className="panel-heading">
        <span>Battle Report</span>
        <h2 id="report-title">{report.title}</h2>
      </div>
      <ReportList title="Casualties" items={report.casualties} />
      <ReportList title="Cohesion" items={report.cohesionChanges} />
      <ReportList title="Objective" items={report.objectiveChanges} />
      <ReportList title="Command Notes" items={report.notes} />
    </section>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="report-block">
      <h3>{title}</h3>
      <ul>
        {items.length > 0 ? items.map((item) => <li key={item}>{item}</li>) : <li>No major change.</li>}
      </ul>
    </div>
  );
}

function App() {
  const [started, setStarted] = useState(false);
  const [state, setState] = useState(() => createInitialBattleState());
  const [assignments, setAssignments] = useState(() => initialAssignments(createInitialBattleState()));
  const latestReport = state.reports.at(-1);
  const squads = useMemo(() => playerSquads(state), [state]);
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
          <section className="panel objective-panel">
            <div className="panel-heading">
              <span>Objective</span>
              <h2>Hold Until Dawn</h2>
            </div>
            <p>Survive three Host-first phases while Greyford Gate remains above zero integrity.</p>
            <div className="squad-counts">
              <span>Free Banners: {squads.filter((squad) => squad.strength > 0).length}</span>
              <span>Ashen Host: {hostSquads(state).filter((squad) => squad.strength > 0).length}</span>
            </div>
          </section>
          <BattleReportPanel report={latestReport} />
          <div className="actions">
            <button className="primary-action" type="button" onClick={commitPhase} disabled={terminal}>
              Commit Phase
            </button>
            <button className="secondary-action" type="button" onClick={restart}>
              <RotateCcw aria-hidden="true" />
              Restart
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default App;
