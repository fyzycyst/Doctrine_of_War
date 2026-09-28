// Prose report lines generated purely from events. The UI shows these after
// playback; the renderer ignores them and plays the events themselves.
import { hexKey } from "../board";
import type { EngineEvent, EngineState, PhaseReport, Weather } from "./types";

const weatherName: Record<Weather, string> = {
  clear: "clear skies",
  rain: "rain",
  mist: "mist",
  ashWind: "ash-wind",
};

export function narrateEvent(event: EngineEvent, state: EngineState): string | null {
  const name = (id: string) => state.squads.find((squad) => squad.id === id)?.name ?? id;
  const objectiveName = (id: string) => state.objectives.find((item) => item.id === id)?.name ?? id;

  switch (event.kind) {
    case "ruleFired":
      return `${name(event.squadId)}: "${event.label}"`;
    case "move": {
      const to = event.path[event.path.length - 1];
      const verb = event.reason === "fallBack" ? "fell back" : event.reason === "charge" ? "charged" : "advanced";
      return `${name(event.squadId)} ${verb} ${event.path.length - 1} hex to ${hexKey(to)}.`;
    }
    case "blocked":
      return `${name(event.squadId)} could not act (${event.reason}).`;
    case "engagement": {
      const lost = (id: string) =>
        `${-event.strengthChanges[id]} strength, ${-event.cohesionChanges[id]} cohesion`;
      const verb = event.charge ? "charged into" : "struck";
      return `${name(event.attackerId)} ${verb} ${name(event.defenderId)} (${name(event.defenderId)} lost ${lost(event.defenderId)}; ${name(event.attackerId)} lost ${lost(event.attackerId)}).`;
    }
    case "rally":
      return `${name(event.sourceId)} rallied ${name(event.targetId)} (+${event.restored} cohesion).`;
    case "rout":
      return event.cause === "strength"
        ? `${name(event.squadId)} was destroyed.`
        : `${name(event.squadId)} broke and routed.`;
    case "exit":
      return `${name(event.squadId)} escaped the field.`;
    case "objectiveDamage":
      return `${name(event.attackerId)} battered ${objectiveName(event.objectiveId)} (${event.oldIntegrity} → ${event.newIntegrity}).`;
    case "outcome":
      return `${event.status === "victory" ? "Victory" : event.status === "stalemate" ? "Stalemate" : "Defeat"}: ${event.reason}`;
    case "fortune":
      return event.outcome === "surge"
        ? `Heroic stand! ${name(event.squadId)} surges forward.`
        : `Wavering… ${name(event.squadId)} hesitates and its order fails.`;
    case "dread": {
      const source = name(event.sourceId);
      return `They know that banner… ${name(event.squadId)} falters before ${source}, "${event.title}" (-${event.shock} cohesion).`;
    }
    case "weatherShift":
      return `The weather turns: ${weatherName[event.from]} gives way to ${weatherName[event.to]}.`;
    case "sighted":
      return `${name(event.byId)} sighted ${name(event.squadId)} at ${hexKey(event.hex)}.`;
  }
}

export function buildReport(phase: number, title: string, events: EngineEvent[], state: EngineState): PhaseReport {
  const lines = events
    .map((event) => {
      const text = narrateEvent(event, state);
      return text && event.beat > 0 ? `Beat ${event.beat}. ${text}` : text;
    })
    .filter((line): line is string => line !== null);

  return { phase, title, lines, status: state.status, seed: state.seed, weather: state.weather };
}
