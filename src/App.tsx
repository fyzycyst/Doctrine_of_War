import { Flag, RotateCcw, Shield, Swords } from "lucide-react";
import { useMemo, useState } from "react";
import { freeBannerDoctrines, getDoctrine } from "./game/doctrines";
import { resolvePhase } from "./game/resolvePhase";
import { createInitialBattleState, firstBreachScenario } from "./game/scenario";
import type { BattleReport, BattleState, DoctrineAssignments, Squad } from "./game/types";

const playerSquads = (state: BattleState) =>
  state.squads.filter((squad) => squad.faction === "free_banners");

const hostSquads = (state: BattleState) =>
  state.squads.filter((squad) => squad.faction === "ashen_host");

function initialAssignments(state: BattleState): DoctrineAssignments {
  return Object.fromEntries(playerSquads(state).map((squad) => [squad.id, squad.assignedDoctrineId]));
}

function resolveLabel(resolve: number) {
  if (resolve >= 3) return "Veteran +3";
  if (resolve === 2) return "Hardened +2";
  if (resolve === 1) return "Tested +1";
  if (resolve === 0) return "Green 0";
  if (resolve === -1) return "Unsteady -1";
  if (resolve === -2) return "Shaken -2";
  return "Broken -3";
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

function DoctrinePanel({
  squads,
  assignments,
  onChange,
  disabled,
}: {
  squads: Squad[];
  assignments: DoctrineAssignments;
  onChange: (squadId: string, doctrineId: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="panel doctrine-panel" aria-labelledby="doctrine-title">
      <div className="panel-heading">
        <span>Command Window</span>
        <h2 id="doctrine-title">Assign Doctrines</h2>
      </div>
      <div className="doctrine-list">
        {squads.map((squad) => {
          const selected = getDoctrine(assignments[squad.id]);

          return (
            <label className="doctrine-row" key={squad.id}>
              <span>
                <strong>{squad.name}</strong>
                <small>
                  {squad.role} / Resolve {resolveLabel(squad.resolve)}
                </small>
              </span>
              <select
                aria-label={`Doctrine for ${squad.name}`}
                value={assignments[squad.id]}
                disabled={disabled}
                onChange={(event) => onChange(squad.id, event.target.value)}
              >
                {freeBannerDoctrines.map((doctrine) => (
                  <option key={doctrine.id} value={doctrine.id}>
                    {doctrine.name}
                  </option>
                ))}
              </select>
              <em>{selected.summary}</em>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function Battlefield({ state, assignments }: { state: BattleState; assignments: DoctrineAssignments }) {
  const gate = state.objectives[0];

  return (
    <section className="battlefield-shell" aria-labelledby="battlefield-title">
      <div className="battlefield-header">
        <div>
          <span>Phase {state.currentPhase}</span>
          <h2 id="battlefield-title">Greyford Gate</h2>
        </div>
        <div className="gate-meter" aria-label={`Greyford Gate integrity ${gate.integrity}`}>
          <span>Gate</span>
          <strong>{gate.integrity}</strong>
        </div>
      </div>
      <div className="battlefield" role="img" aria-label="2D battlefield with three approach lanes">
        <div className="gate-objective">Greyford Gate</div>
        {firstBreachScenario.lanes.map((lane) => (
          <div
            className="lane"
            key={lane.id}
            style={{
              left: `${lane.x}%`,
              top: `${lane.y}%`,
              width: `${lane.width}%`,
              height: `${lane.height}%`,
            }}
          >
            <span>{lane.name}</span>
          </div>
        ))}
        {state.squads.map((squad) => {
          const lane = firstBreachScenario.lanes.find((item) => item.id === squad.laneId)!;
          const isPlayer = squad.faction === "free_banners";
          const x = isPlayer ? lane.x + lane.width * 0.72 : lane.x + lane.width * 0.18;
          const y = lane.y + lane.height * (squad.role === "support" ? 0.72 : 0.36);
          const doctrineId = isPlayer ? assignments[squad.id] : squad.assignedDoctrineId;
          const doctrine = getDoctrine(doctrineId);

          return (
            <div
              className={`squad-token ${isPlayer ? "banner" : "ashen"}`}
              key={squad.id}
              style={{ left: `${x}%`, top: `${y}%` }}
              title={`${squad.name}: ${doctrine.name}`}
            >
              <strong>{squad.name}</strong>
              <span>{doctrine.name}</span>
              <small>
                STR {squad.strength} / COH {squad.cohesion}
              </small>
            </div>
          );
        })}
      </div>
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

