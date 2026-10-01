import { Castle, CloudFog, CloudRain, DoorOpen, Settings, Sun, Swords, Volume2, VolumeX, Wind } from "lucide-react";
import { goalFor, type GoalIcon } from "../game/goal";

const GOAL_ICON: Record<GoalIcon, typeof Sun> = { hold: Castle, break: Swords, escape: DoorOpen };
import { useFlow } from "../flow/flowStore";
import { useAudioStore } from "../audioStore";
import type { Weather } from "../../game/engine";
import { useGame, useShownView, type Stage } from "../game/gameStore";
import { WEATHER_EFFECT, WEATHER_NAME } from "../game/view";
import { useShowSeed } from "../settingsStore";

const WEATHER_ICON: Record<Weather, typeof Sun> = { clear: Sun, rain: CloudRain, mist: CloudFog, ashWind: Wind };

const STAGE_NAME: Record<Stage, string> = {
  briefing: "Briefing",
  deploy: "Deployment",
  command: "Orders",
  resolving: "Battle",
  report: "Chronicle",
  outcome: "Aftermath",
};

export function CommandBar() {
  const showSeed = useShowSeed();
  const scenario = useGame((s) => s.scenario);
  // During playback the weather chip follows the board (a shift lands when it plays).
  const view = useShownView();
  const muted = useAudioStore((s) => s.muted);
  const toggleMuted = useAudioStore((s) => s.toggleMuted);
  const setSettingsOpen = useFlow((s) => s.setSettingsOpen);
  const stage = useGame((s) => s.stage);
  const pace = useGame((s) => s.pace);
  const setPace = useGame((s) => s.setPace);
  const log = useGame((s) => s.log);
  const WeatherIcon = WEATHER_ICON[view.weather];
  // A weather shift plays as a chyron in this bar (T19), not as a banner over the board.
  const shift = useGame((s) => s.callouts.find((callout) => callout.kind === "weather"));
  // The new weather, from the callout: the board only takes it once the step lands.
  const turning = shift ? ((Object.keys(WEATHER_NAME) as Weather[]).find((key) => WEATHER_NAME[key] === shift.text) ?? view.weather) : view.weather;
  const TurningIcon = WEATHER_ICON[turning];
  // In the chronicle and aftermath, show the phase just fought, not the one to come.
  const reporting = stage === "resolving" || stage === "report" || stage === "outcome";
  const phase = reporting && log.length > 0 ? log[log.length - 1].phase : Math.min(view.phase, view.maxPhases);
  // The aim follows the board: at the dawn moment (and in the report after it) that is the next phase's.
  const goal = goalFor(scenario, Math.min(view.phase, view.maxPhases), view);

  return (
    <header className="command-bar">
      <div className="bar-title">
        <span className="bar-stage">{STAGE_NAME[stage]}</span>
        <h1>{scenario.title}</h1>
      </div>
      <div className="bar-phase" role="img" aria-label={`Phase ${phase} of ${view.maxPhases}`}>
        <span className="bar-phase-label" aria-hidden="true">
          Phase {phase}/{view.maxPhases}
        </span>
        <span className="pips" aria-hidden="true">
          {Array.from({ length: view.maxPhases }, (_, i) => (
            <span key={i} className={`pip ${i + 1 < phase ? "done" : i + 1 === phase ? "now" : ""}`} />
          ))}
        </span>
      </div>
      {goal && (
        <div className={`chip goal-chip goal-${goal.icon}`} role="status" aria-label={`Goal: ${goal.text}${goal.progress ? `, ${goal.progress}` : ""}`}>
          <GoalIconView icon={goal.icon} />
          <span aria-hidden="true">{goal.text}</span>
          {goal.progress && (
            <span className="mono goal-progress" aria-hidden="true">
              {goal.progress}
            </span>
          )}
        </div>
      )}
      {shift ? (
        <div key={shift.id} className="chip weather-chip chyron" role="status">
          <TurningIcon size={15} aria-hidden="true" />
          <span className="chyron-text">
            <span className="chyron-title">{shift.title}:</span> <strong>{shift.text}</strong>
            <span className="chyron-effect"> · {WEATHER_EFFECT[turning]}</span>
          </span>
        </div>
      ) : (
        <div className="chip weather-chip" title={WEATHER_EFFECT[view.weather]}>
          <WeatherIcon size={15} aria-hidden="true" />
          <span>
            {WEATHER_NAME[view.weather]}
            <span className="sr-only">. {WEATHER_EFFECT[view.weather]}</span>
          </span>
        </div>
      )}
      <div className="chip fortune-chip" aria-label={showSeed ? `Fortune ${view.fortune}, seed ${view.seed}` : `Fortune ${view.fortune}`}>
        <span className={`fortune-dot ${view.fortune}`} aria-hidden="true" />
        <span aria-hidden="true">
          Fortune {view.fortune}
          {showSeed && (
            <>
              {" "}
              · <span className="mono">#{view.seed}</span>
            </>
          )}
        </span>
      </div>
      <button
        type="button"
        className="chip mute"
        aria-pressed={muted}
        aria-label={muted ? "Sound off" : "Sound on"}
        title={muted ? "Unmute" : "Mute"}
        onClick={toggleMuted}
      >
        {muted ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
      </button>
      <button type="button" className="chip mute" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>
        <Settings size={15} aria-hidden="true" />
      </button>
      <div className="pace" role="group" aria-label="Battle pace">
        {(["readable", "fast"] as const).map((option) => (
          <button key={option} type="button" aria-pressed={pace === option} onClick={() => setPace(option)}>
            {option === "readable" ? "Readable" : "Fast"}
          </button>
        ))}
      </div>
    </header>
  );
}

function GoalIconView({ icon }: { icon: GoalIcon }) {
  const Icon = GOAL_ICON[icon];
  return <Icon size={15} aria-hidden="true" />;
}
