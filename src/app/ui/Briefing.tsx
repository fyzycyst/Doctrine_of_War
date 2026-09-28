import { useEffect, useRef } from "react";
import type { EngineScenario, FortuneMode } from "../../game/engine";
import { useGame } from "../game/gameStore";
import { rosterName, WEATHER_NAME } from "../game/view";

/** The win and loss conditions in plain words. */
export function conditionsInWords(scenario: EngineScenario): { win: string; lose: string[] } {
  const win = scenario.winCondition;
  const objective = (id: string) => scenario.objectives.find((item) => item.id === id)?.name ?? "the objective";
  // Mid-sentence, "The Last Gate" reads as "the Last Gate".
  const inline = (name: string) => name.replace(/^The /, "the ");
  const squadNames = (ids: string[]) =>
    ids
      .map((id) => {
        const squad = scenario.squads.find((item) => item.id === id);
        return inline(squad ? rosterName(squad) : id);
      })
      .join(" and ");
  const phases = `${scenario.maxPhases} phase${scenario.maxPhases === 1 ? "" : "s"}`;
  const lose: string[] = [];
  let winText: string;

  switch (win.kind) {
    case "holdObjective":
      winText = `Keep ${inline(objective(win.objectiveId))} standing through all ${phases}.`;
      lose.push(`${objective(win.objectiveId)} is battered down.`);
      break;
    case "escapeEdge":
      winText = win.mustEscape?.length
        ? `Get ${squadNames(win.mustEscape)} and ${win.count - win.mustEscape.length} more off the field through the far edge within ${phases}.`
        : `Get ${win.count} companies off the field through the far edge within ${phases}.`;
      lose.push("Time runs out before enough companies escape.");
      break;
    case "holdThenBreak":
      winText = `Keep ${inline(objective(win.objectiveId))} standing until dawn (phase ${win.dawnPhase}), then break ${squadNames(win.squadIds)} before ${phases} are out.`;
      lose.push(`${objective(win.objectiveId)} is battered down.`);
      break;
    case "destroySquads":
      winText = `Rout or destroy ${win.squadIds.length === 1 ? "the marked enemy company" : `all ${win.squadIds.length} marked enemy companies`} within ${phases}.`;
      lose.push("Time runs out with a marked company still in the field.");
      break;
  }
  for (const condition of scenario.defeatConditions ?? []) {
    lose.push(
      condition.kind === "enemyEscape"
        ? `${condition.count} enemy ${condition.count === 1 ? "company slips" : "companies slip"} past your line.`
        : `${condition.count} of your companies are routed or destroyed.`,
    );
  }
  lose.push("Every one of your companies leaves the field.");
  return { win: winText, lose };
}

export function forecastInWords(scenario: EngineScenario, fortune: FortuneMode): string {
  const forecast = scenario.forecast;
  const start = WEATHER_NAME[forecast?.start ?? "clear"];
  if (!forecast || fortune === "off" || forecast.shiftChance <= 0) {
    return `${start}, holding all battle.`;
  }
  const shifts = forecast.shifts
    .filter((weather) => weather !== forecast.start)
    .map((weather) => WEATHER_NAME[weather].toLowerCase());
  return `${start} at first. Each phase there is a ${Math.round(forecast.shiftChance * 100)}% chance it turns to ${shifts.join(", ").replace(/, ([^,]*)$/, " or $1")}.`;
}

export const TIME_OF_DAY_NAME = {
  day: "Dusk, the last light of the day",
  nightFires: "Night, lit by the burning river",
  rainGrey: "Grey rain over the saltmarsh",
  predawn: "The dark hour before dawn",
  sunrise: "Sunrise",
} as const;

export function Briefing() {
  const scenario = useGame((s) => s.scenario);
  const setup = useGame((s) => s.setup);
  const takeCommand = useGame((s) => s.takeCommand);
  const button = useRef<HTMLButtonElement>(null);
  const { win, lose } = conditionsInWords(scenario);

  useEffect(() => button.current?.focus(), []);

  return (
    <div className="briefing-scrim">
      <section className="scroll" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
        <div className="scroll-rod" aria-hidden="true" />
        <div className="scroll-sheet">
          <p className="scroll-eyebrow">Orders from the Marshal</p>
          <h1 id="briefing-title">{scenario.title}</h1>
          <p className="scroll-briefing">{scenario.briefing}</p>
          <dl className="scroll-terms">
            <div>
              <dt>To win</dt>
              <dd>{win}</dd>
            </div>
            <div>
              <dt>You lose if</dt>
              <dd>
                <ul>
                  {lose.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt>Forecast</dt>
              <dd>{forecastInWords(scenario, setup.fortune)}</dd>
            </div>
            <div>
              <dt>Hour</dt>
              <dd>{TIME_OF_DAY_NAME[scenario.timeOfDay ?? "day"]}</dd>
            </div>
          </dl>
          <button ref={button} type="button" className="btn-command" onClick={takeCommand}>
            Take Command
          </button>
        </div>
        <div className="scroll-rod" aria-hidden="true" />
      </section>
    </div>
  );
}
