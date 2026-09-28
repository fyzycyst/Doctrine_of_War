import { Castle, CloudRain, Crown, Eye, Flag, Skull, Sparkles, Swords, Wind, type LucideIcon } from "lucide-react";
import { useMemo, useRef } from "react";
import { useGame } from "../game/gameStore";
import { Modal, rosterFocus } from "./Modal";
import { buildChronicle, firedOrders, reportHeadline, splitRule, WEATHER_NAME, type ChronicleTone, type FiredOrders } from "../game/view";

const TONE_ICON: Record<ChronicleTone, LucideIcon> = {
  order: Flag,
  clash: Swords,
  rally: Flag,
  rout: Wind,
  surge: Sparkles,
  waver: Wind,
  dread: Skull,
  sight: Eye,
  weather: CloudRain,
  siege: Castle,
  outcome: Crown,
};

const BEAT_NAME = ["Before the clash", "First beat", "Second beat", "Third beat"];

export function ObjectiveStatus() {
  const view = useGame((s) => s.view);
  return (
    <ul className="objectives">
      {view.objectives.map((objective) => (
        <li key={objective.id}>
          <span className="objective-name">{objective.name}</span>
          <span className="meter meter-integrity" role="meter" aria-label={`${objective.name} integrity`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={objective.integrity}>
            <span style={{ width: `${Math.max(0, objective.integrity)}%` }} />
          </span>
          <span className="mono">{objective.integrity}</span>
        </li>
      ))}
    </ul>
  );
}

/** The chronicle of one phase, built only from the player's filtered event stream. */
export function PhaseReport() {
  const log = useGame((s) => s.log);
  const engine = useGame((s) => s.engine);
  const scenario = useGame((s) => s.scenario);
  const nextPhase = useGame((s) => s.nextPhase);
  const entry = log[log.length - 1];
  const button = useRef<HTMLButtonElement>(null);

  // `engine` is used only to name the companies the (already filtered) events mention.
  const chronicle = useMemo(() => (entry ? buildChronicle(entry.events, engine) : []), [entry, engine]);
  const fired = useMemo(
    () => (entry ? firedOrders(entry.events, engine, scenario.playerFaction) : []),
    [entry, engine, scenario.playerFaction],
  );
  if (!entry) {
    return null;
  }

  const ours = fired.filter((group) => group.mine);
  const theirs = fired.filter((group) => !group.mine);
  const beats = [...new Set(chronicle.map((line) => line.beat))].sort();
  const over = entry.status !== "command";

  return (
    <Modal className="report" labelledBy="report-title" initialFocus={button} returnFocus={rosterFocus}>
        <header>
          <p className="report-eyebrow">Chronicle · Phase {entry.phase}</p>
          <h2 id="report-title">{reportHeadline(entry.title)}</h2>
        </header>

        <div className="report-body">
          <section aria-labelledby="fired-title" className="fired">
            <h3 id="fired-title">Your standing orders that fired</h3>
            {ours.length === 0 ? <p className="quiet">None of your orders fired.</p> : <FiredList groups={ours} />}
            {theirs.length > 0 && (
              <details className="fired-host">
                <summary>
                  Host orders you witnessed <span className="mono">({theirs.length})</span>
                </summary>
                <FiredList groups={theirs} />
              </details>
            )}
          </section>

          <section aria-labelledby="events-title" className="chronicle">
            <h3 id="events-title">What happened</h3>
            {chronicle.length === 0 && <p className="quiet">The field held its breath. No blows were struck.</p>}
            {beats.map((beat) => (
              <div key={beat} className="beat">
                <p className="beat-name">{BEAT_NAME[beat] ?? `Beat ${beat}`}</p>
                <ul>
                  {chronicle
                    .filter((line) => line.beat === beat)
                    .map((line) => {
                      const Icon = TONE_ICON[line.tone];
                      return (
                        <li key={line.key} className={`tone-${line.tone}`}>
                          <Icon size={15} aria-hidden="true" />
                          <span>{line.text}</span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </section>
        </div>

        <footer className="report-foot">
          <ObjectiveStatus />
          <p className="report-meta">
            {WEATHER_NAME[entry.weather]} · seed <span className="mono">#{entry.seed}</span>
          </p>
          <button ref={button} type="button" className="btn-command" onClick={nextPhase}>
            {over ? "See the outcome" : "Next Phase"}
          </button>
        </footer>
    </Modal>
  );
}

function FiredList({ groups }: { groups: FiredOrders[] }) {
  return (
    <ul>
      {groups.map((group) => (
        <li key={group.squadId} className={group.mine ? "mine" : "theirs"}>
          <span className="fired-squad">{group.squadName}</span>
          {group.rules.map((rule) => {
            const { when, then } = splitRule(rule.label);
            return (
              <span key={rule.label} className="fired-rule">
                <span>
                  {when && <span className="rule-when">{when} </span>}
                  <span className="rule-then">→ {then}</span>
                </span>
                {rule.count > 1 && <span className="fired-count">×{rule.count}</span>}
              </span>
            );
          })}
        </li>
      ))}
    </ul>
  );
}
