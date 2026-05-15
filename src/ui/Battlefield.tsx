import { getDoctrine } from "../game/doctrines";
import { firstBreachScenario } from "../game/scenario";
import type { BattleState, DoctrineAssignments } from "../game/types";

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

export function Battlefield({ state, assignments }: { state: BattleState; assignments: DoctrineAssignments }) {
  const gate = state.objectives[0];

  return (
    <section className="battlefield-shell" aria-labelledby="battlefield-title">
      <div className="battlefield-header">
        <div>
          <span>Phase {state.currentPhase}</span>
          <h2 id="battlefield-title">Greyford Gate</h2>
        </div>
        <div className="gate-meter">
          <span>Gate</span>
          <StatMeter label="Greyford Gate integrity" value={gate.integrity} tone="gate" shortLabel="Integrity" />
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
    </section>
  );
}
