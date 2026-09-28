import { CloudFog, CloudRain, Sun, Wind } from "lucide-react";
import type { Weather } from "../../game/engine";
import { useGame, type Stage } from "../game/gameStore";
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
  const view = useGame((s) => s.view);
  const stage = useGame((s) => s.stage);
  const pace = useGame((s) => s.pace);
  const setPace = useGame((s) => s.setPace);
  const log = useGame((s) => s.log);
  const WeatherIcon = WEATHER_ICON[view.weather];
  // In the chronicle and aftermath, show the phase just fought, not the one to come.
  const reporting = stage === "report" || stage === "outcome";
  const phase = reporting && log.length > 0 ? log[log.length - 1].phase : Math.min(view.phase, view.maxPhases);

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
