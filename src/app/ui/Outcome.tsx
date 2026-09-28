import { useRef } from "react";
import { scenarios } from "../../game/engine";
import { useGame } from "../game/gameStore";
import { Modal, rosterFocus } from "./Modal";
import { ObjectiveStatus } from "./PhaseReport";

const OUTCOME: Record<string, { word: string; line: string }> = {
  victory: { word: "Victory", line: "The banners still stand." },
  defeat: { word: "Defeat", line: "The line is broken." },
  stalemate: { word: "Stalemate", line: "Neither side can claim the field." },
};

export function Outcome() {
  const view = useGame((s) => s.view);
  const log = useGame((s) => s.log);
  const scenario = useGame((s) => s.scenario);
  const retry = useGame((s) => s.retry);
  const loadBattle = useGame((s) => s.loadBattle);
  const first = useRef<HTMLButtonElement>(null);

  const status = String(view.status);
  const won = status !== "defeat";
  const copy = OUTCOME[status] ?? { word: status, line: "" };
  const outcomeEvent = log
    .flatMap((entry) => entry.events)
    .find((event) => event.kind === "outcome");
  const reason = outcomeEvent?.kind === "outcome" ? outcomeEvent.reason : copy.line;
  const mine = view.squads.filter((squad) => squad.faction === view.viewer);
  const standing = mine.filter((squad) => squad.status === "active").length;

  // Stub until the campaign map ticket: recordBattle + the map screen replace this.
  // For now Continue opens the next scenario's briefing as a standalone battle.
  const index = scenarios.findIndex((item) => item.id === scenario.id);
  const next = scenarios[index + 1];
  const onContinue = () => {
    const target = next ?? scenarios[0];
    loadBattle(target, { seed: target.curatedSeed ?? 1, fortune: "on" });
  };

  return (
    <Modal className={`outcome outcome-${status}`} labelledBy="outcome-title" initialFocus={first} returnFocus={rosterFocus}>
        <p className="report-eyebrow">{scenario.title}</p>
        <h2 id="outcome-title">{copy.word}</h2>
        <p className="outcome-reason">{reason}</p>
        <p className="outcome-tally">
          {standing} of {mine.length} companies still standing
        </p>
        <ObjectiveStatus />
        <p className="report-meta">
          Fortune {view.fortune} · seed <span className="mono">#{view.seed}</span>
        </p>
        <div className="outcome-actions">
          {/* After a defeat the next move is a retry; otherwise it is moving on. */}
          <button
            ref={won ? undefined : first}
            type="button"
            className={won ? "btn-quiet" : "btn-command"}
            onClick={() => retry("same")}
          >
            Retry, same fortune
          </button>
          <button type="button" className="btn-quiet" onClick={() => retry("new")}>
            Retry, new fortune
          </button>
          <button ref={won ? first : undefined} type="button" className={won ? "btn-command" : "btn-quiet"} onClick={onContinue}>
            {next ? `Continue to ${next.title}` : "Continue"}
          </button>
        </div>
    </Modal>
  );
}
