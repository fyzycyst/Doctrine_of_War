import { getDoctrine } from "../game/doctrines";
import { firstBreachScenario } from "../game/scenario";
import { terrainDefenseBonus, type HexCoord, type TerrainType } from "../game/board";
import type { BattleState, DoctrineAssignments, PhaseEvent } from "../game/types";
import { HexBoard } from "./HexBoard";

const terrainTypes: TerrainType[] = ["road", "ridge", "ford", "wall", "field", "ruin"];

function terrainName(terrain: TerrainType) {
  return terrain[0].toUpperCase() + terrain.slice(1);
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function StatMeter({
  label,
  value,
  tone,
  shortLabel,
}: {
  label: string;
  value: number;
  tone: "banner" | "ashen" | "gate";
  shortLabel: string;
}) {
  const boundedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={`stat-meter ${tone}`} aria-label={`${label} ${value} of 100`} title={`${label} ${value} of 100`}>
      <span className="stat-meter-label">{shortLabel}</span>
      <span className="stat-meter-track" aria-hidden="true">
        <span className="stat-meter-fill" style={{ width: `${boundedValue}%` }} />
      </span>
    </div>
  );
}

export function Battlefield({
  state,
  assignments,
  phaseEvents,
  activePhaseEvent,
  playbackState,
  selectedSquadId,
  deploymentLocked,
  onSelectSquad,
  onDeploySquad,
}: {
  state: BattleState;
  assignments: DoctrineAssignments;
  phaseEvents?: PhaseEvent[];
  activePhaseEvent?: PhaseEvent;
  playbackState?: "command" | "resolving" | "report";
  selectedSquadId?: string | null;
  deploymentLocked?: boolean;
  onSelectSquad?: (squadId: string) => void;
  onDeploySquad?: (squadId: string, coord: HexCoord) => void;
}) {
  const gate = state.objectives[0];

  return (
    <section className="battlefield-shell" aria-labelledby="battlefield-title">
      <div className="battlefield-header">
        <div>
          <span>Phase {state.currentPhase}</span>
          <h2 id="battlefield-title">Greyford Gate</h2>
        </div>
        <div className="gate-readout" aria-label={`Gate integrity ${gate.integrity}`}>
          <span>Gate Integrity</span>
          <strong>{gate.integrity}</strong>
        </div>
      </div>
      <div className="battlefield">
        <HexBoard
          board={firstBreachScenario.board!}
          squads={state.squads}
          assignments={assignments}
          objectives={state.objectives}
          playerFaction={firstBreachScenario.playerFaction}
          phaseEvents={phaseEvents}
          activePhaseEvent={activePhaseEvent}
          selectedSquadId={selectedSquadId}
          deploymentLocked={deploymentLocked}
          onSelectSquad={onSelectSquad}
          onDeploySquad={onDeploySquad}
        />
        {playbackState === "resolving" && <div className="playback-badge">Resolving phase events</div>}
        <ul className="terrain-legend" aria-label="Terrain effects">
          {terrainTypes.map((terrain) => (
            <li className={`terrain-legend-item terrain-${terrain}`} key={terrain}>
              <span className="terrain-swatch" aria-hidden="true" />
              <span>
                {terrainName(terrain)} {signed(terrainDefenseBonus(terrain))} defense
              </span>
            </li>
          ))}
        </ul>
        <div className="board-status-panel">
          <StatMeter
            label="Greyford Gate field integrity"
            value={gate.integrity}
            tone="gate"
            shortLabel="Integrity"
          />
          {state.squads.map((squad) => {
            const isPlayer = squad.faction === "free_banners";
            const doctrineId = isPlayer ? assignments[squad.id] : squad.assignedDoctrineId;
            const doctrine = getDoctrine(doctrineId);

            return (
              <div className={`squad-status ${isPlayer ? "banner" : "ashen"}`} key={squad.id}>
                <strong>{squad.name}</strong>
                <span>{doctrine.name}</span>
                <div className="squad-meters">
                  <StatMeter
                    label={`${squad.name} strength`}
                    value={squad.strength}
                    tone={isPlayer ? "banner" : "ashen"}
                    shortLabel="Str"
                  />
                  <StatMeter
                    label={`${squad.name} cohesion`}
                    value={squad.cohesion}
                    tone={isPlayer ? "banner" : "ashen"}
                    shortLabel="Coh"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
