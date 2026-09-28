import { Castle, CloudRain, Crown, Eye, Flag, RotateCcw, Skull, Sparkles, Swords, Wind, type LucideIcon } from "lucide-react";
import { useMemo, useRef } from "react";
import { useGame } from "../game/gameStore";
import {
  buildChronicle,
  firedOrders,
  namesFor,
  statChip,
  type Chip,
  type ChronicleLine,
  type ChronicleTone,
  type FiredOrders,
  type Losses,
} from "../game/chronicle";
import { reportHeadline, splitRule, WEATHER_NAME } from "../game/view";
import { useFirstBattle } from "../guide/CoachLayer";
import { useGuide } from "../guide/guideStore";
import { InlineCoach } from "../guide/InlineCoach";
import { Modal, rosterFocus } from "./Modal";

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
  const view = useGame((s) => s.view);
  const nextPhase = useGame((s) => s.nextPhase);
  const replay = useGame((s) => s.replayPhase);
  const chronicleStep = useGuide((s) => s.coach === "active" && s.step === "chronicle");
  const firstBattle = useFirstBattle();
  const teaching = chronicleStep && firstBattle;
  const entry = log[log.length - 1];
  const button = useRef<HTMLButtonElement>(null);

  // Names come only from what the player saw at the start and end of the phase.
  const names = useMemo(() => (entry ? namesFor([entry.start, view]) : null), [entry, view]);
  const beats = useMemo(() => (entry && names ? buildChronicle(entry.events, names) : []), [entry, names]);
  const fired = useMemo(() => (entry && names ? firedOrders(entry.events, names) : []), [entry, names]);
  if (!entry) {
    return null;
  }

  const ours = fired.filter((group) => group.mine);
  const theirs = fired.filter((group) => !group.mine);
  const over = entry.status !== "command";

  return (
    <Modal className="report" labelledBy="report-title" initialFocus={button} returnFocus={rosterFocus}>
        <header>
          <p className="report-eyebrow">Chronicle · Phase {entry.phase}</p>
          <h2 id="report-title">{entry.intent || reportHeadline(entry.title)}</h2>
        </header>

        <div className="report-body">
          {teaching && <InlineCoach step="chronicle" />}
          <section aria-labelledby="fired-title" className={`fired ${teaching ? "coach-target" : ""}`}>
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
            {beats.length === 0 && <p className="quiet">The field held its breath. No blows were struck.</p>}
            {beats.map((beat) => (
              <div key={beat.beat} className="beat">
                <p className="beat-name">{BEAT_NAME[beat.beat] ?? `Beat ${beat.beat}`}</p>
                <ul>
                  {beat.story.map((line) => (
                    <StoryLine key={line.key} line={line} />
                  ))}
                </ul>
                {beat.blows && (
                  <details className="blows">
                    <summary>
                      <Swords size={14} aria-hidden="true" />
                      <span>
                        {beat.blows.lines.length === 1 ? "One exchange of blows" : `${beat.blows.lines.length} exchanges of blows`}
                      </span>
                      <LossChips label="yours" losses={beat.blows.yours} />
                      <LossChips label="theirs" losses={beat.blows.theirs} />
                    </summary>
                    <ul>
                      {beat.blows.lines.map((line) => (
                        <StoryLine key={line.key} line={line} />
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </section>
        </div>

        <footer className="report-foot">
          <ObjectiveStatus />
          <p className="report-meta">
            {WEATHER_NAME[entry.weather]} · seed <span className="mono">#{entry.seed}</span>
          </p>
          <button type="button" className="btn-quiet" onClick={replay}>
            <RotateCcw size={14} aria-hidden="true" /> Replay phase
          </button>
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

function Chips({ chips, className = "" }: { chips: Chip[]; className?: string }) {
  if (chips.length === 0) {
    return null;
  }
  return (
    <span className={`chips ${className}`}>
      {chips.map((chip) => (
        <span key={chip.text} className={`chip-stat ${chip.tone}`}>
          {chip.text}
        </span>
      ))}
    </span>
  );
}

function StoryLine({ line }: { line: ChronicleLine }) {
  const Icon = TONE_ICON[line.tone];
  return (
    <li className={`tone-${line.tone}`}>
      <Icon size={15} aria-hidden="true" />
      <span className="story">
        <span className="story-text">{line.text}</span>
        <Chips chips={line.chips} />
        {line.riposte && line.riposte.length > 0 && (
          <>
            <span className="riposte-label">riposte</span>
            <Chips chips={line.riposte} className="riposte" />
          </>
        )}
      </span>
    </li>
  );
}

function LossChips({ label, losses }: { label: string; losses: Losses }) {
  const chips = [
    ...(losses.strength ? [statChip(losses.strength, "STR")] : []),
    ...(losses.cohesion ? [statChip(losses.cohesion, "COH")] : []),
  ];
  if (chips.length === 0) {
    return null;
  }
  return (
    <span className={`loss-group ${label}`}>
      <span className="riposte-label">{label}</span>
      <Chips chips={chips} />
    </span>
  );
}
