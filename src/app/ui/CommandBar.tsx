import { Castle, CloudFog, CloudRain, DoorOpen, Settings, Sun, Swords, Volume2, VolumeX, Wind } from "lucide-react";
import { goalFor, type GoalIcon } from "../game/goal";

const GOAL_ICON: Record<GoalIcon, typeof Sun> = { hold: Castle, break: Swords, escape: DoorOpen };
import { useFlow } from "../flow/flowStore";
import { useAudioStore } from "../audioStore";
import type { Weather } from "../../game/engine";
import { useGame, useShownView, type Stage } from "../game/gameStore";
import { WEATHER_EFFECT, WEATHER_NAME } from "../game/view";

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
  // In the chronicle and aftermath, show the phase just fought, not the one to come.
  const reporting = stage === "resolving" || stage === "report" || stage === "outcome";
  const phase = reporting && log.length > 0 ? log[log.length - 1].phase : Math.min(view.phase, view.maxPhases);
  const goal = goalFor(scenario, phase, view);

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
      <div className="chip weather-chip" title={WEATHER_EFFECT[view.weather]}>
        <WeatherIcon size={15} aria-hidden="true" />
        <span>
          {WEATHER_NAME[view.weather]}
          <span className="sr-only">. {WEATHER_EFFECT[view.weather]}</span>
        </span>
      </div>
      <div className="chip fortune-chip" aria-label={`Fortune ${view.fortune}, seed ${view.seed}`}>
        <span className={`fortune-dot ${view.fortune}`} aria-hidden="true" />
        <span aria-hidden="true">
          Fortune {view.fortune} · <span className="mono">#{view.seed}</span>
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
