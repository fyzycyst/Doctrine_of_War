import { freeBannerDoctrines, getDoctrine } from "../game/doctrines";
import type { DoctrineAssignments, Squad } from "../game/types";

function resolveLabel(resolve: number) {
  if (resolve >= 3) return "Veteran +3";
  if (resolve === 2) return "Hardened +2";
  if (resolve === 1) return "Tested +1";
  if (resolve === 0) return "Green 0";
  if (resolve === -1) return "Unsteady -1";
  if (resolve === -2) return "Shaken -2";
  return "Broken -3";
}

export function DoctrinePanel({
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
                title={selected.summary}
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
            </label>
          );
        })}
      </div>
    </section>
  );
}
