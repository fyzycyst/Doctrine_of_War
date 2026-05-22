import { useEffect, useMemo, useState } from "react";
import { getHex, sameHex, type HexCoord } from "./game/board";
import { resolvePhase } from "./game/resolvePhase";
import { createInitialBattleState, firstBreachScenario } from "./game/scenario";
import type { BattleState, DoctrineAssignments, PhaseEvent, Squad } from "./game/types";
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

type PlaybackState = "command" | "resolving" | "report";
const PLAYBACK_TIMING_MS: Record<PhaseEvent["kind"], number> = {
  support: 625,
  engagement: 1250,
  objectiveDamage: 875,
};
const PLAYBACK_ORDER: Record<PhaseEvent["kind"], number> = {
  support: 0,
  engagement: 1,
  objectiveDamage: 2,
};

function initialAssignments(state: BattleState): DoctrineAssignments {
  return Object.fromEntries(playerSquads(state).map((squad) => [squad.id, squad.assignedDoctrineId]));
}

function orderPlaybackEvents(events: PhaseEvent[]) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => PLAYBACK_ORDER[a.event.kind] - PLAYBACK_ORDER[b.event.kind] || a.index - b.index)
    .map(({ event }) => event);
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
  const [playbackState, setPlaybackState] = useState<PlaybackState>("command");
  const [activeEventIndex, setActiveEventIndex] = useState(0);
  const latestReport = state.reports.at(-1);
  const terminal = state.status !== "command";
  const resolving = playbackState === "resolving";
  const playbackEvents = useMemo(
    () => orderPlaybackEvents(latestReport?.phaseEvents ?? []),
    [latestReport],
  );
  const visiblePhaseEvents =
    playbackState === "command"
      ? []
      : playbackState === "resolving"
        ? playbackEvents.slice(0, activeEventIndex + 1)
        : playbackEvents;
  const activePhaseEvent = resolving ? playbackEvents[activeEventIndex] : undefined;
  const squads = useMemo(() => playerSquads(state), [state]);
  const enemies = useMemo(() => hostSquads(state), [state]);
  const deploymentLocked = terminal || resolving || state.currentPhase !== 1 || state.reports.length > 0;
  const statusLabel =
    terminal
      ? state.status === "victory"
        ? "Scenario Victory"
        : "Scenario Defeat"
      : playbackState === "command"
        ? "Command"
        : playbackState === "resolving"
          ? "Resolving"
          : "Report";

  useEffect(() => {
    if (!resolving) {
      return undefined;
    }

    const activeEvent = playbackEvents[activeEventIndex];

    if (!activeEvent) {
      setPlaybackState("report");
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setActiveEventIndex((currentIndex) => {
        const nextIndex = currentIndex + 1;

        if (nextIndex >= playbackEvents.length) {
          setPlaybackState("report");
          return currentIndex;
        }

        return nextIndex;
      });
    }, PLAYBACK_TIMING_MS[activeEvent.kind]);

    return () => window.clearTimeout(timeout);
  }, [activeEventIndex, playbackEvents, resolving]);

  function updateAssignment(squadId: string, doctrineId: string) {
    setAssignments((current) => ({ ...current, [squadId]: doctrineId }));
  }

  function commitPhase() {
    setState((current) => {
      const next = resolvePhase(current, assignments);
      setAssignments(initialAssignments(next));
      setSelectedSquadId(null);
      setActiveEventIndex(0);
      setPlaybackState("resolving");
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
    setActiveEventIndex(0);
    setPlaybackState("command");
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
        <div className={`status-pill ${terminal ? state.status : playbackState}`}>{statusLabel}</div>
      </header>
      <div className="layout">
        <DoctrinePanel
          squads={squads}
          assignments={assignments}
          onChange={updateAssignment}
          disabled={terminal || resolving}
        />
        <Battlefield
          state={state}
          assignments={assignments}
          phaseEvents={visiblePhaseEvents}
          activePhaseEvent={activePhaseEvent}
          playbackState={playbackState}
          selectedSquadId={selectedSquadId}
          deploymentLocked={deploymentLocked}
          onSelectSquad={setSelectedSquadId}
          onDeploySquad={deploySquad}
        />
        <aside className="right-rail">
          <ObjectivePanel playerSquads={squads} hostSquads={enemies} />
          <BattleReportPanel report={latestReport} />
          {resolving && (
            <button
              className="secondary-action playback-skip"
              type="button"
              onClick={() => setPlaybackState("report")}
            >
              Skip Playback
            </button>
          )}
          <ActionBar onCommit={commitPhase} onRestart={restart} disabled={terminal || resolving} />
        </aside>
      </div>
    </main>
  );
}

export default App;
