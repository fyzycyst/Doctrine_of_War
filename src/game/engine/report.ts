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

/**
 * Where narration looks up names. A VisibleState satisfies it, so the UI never needs
 * raw engine state; an id it cannot resolve is narrated as unseen, never printed.
 */
export interface NameSource {
  squads: { id: string; name: string }[];
  objectives: { id: string; name: string }[];
}

export function narrateEvent(event: EngineEvent, names: NameSource): string | null {
  const name = (id: string) => names.squads.find((squad) => squad.id === id)?.name ?? "an unseen company";
  const objectiveName = (id: string) => names.objectives.find((item) => item.id === id)?.name ?? "the objective";

  switch (event.kind) {
    case "ruleFired":
      return `${name(event.squadId)}: "${event.label}"`;
    case "move": {
      const verb = event.reason === "fallBack" ? "fell back" : event.reason === "charge" ? "charged" : "advanced";
      if (event.from === null && event.path.length > 0) {
        return `${name(event.squadId)} emerged from the dark at ${hexKey(event.path[event.path.length - 1])}.`;
      }
      if (event.to === null) {
        return `${name(event.squadId)} ${verb} into the dark.`;
      }
      return `${name(event.squadId)} ${verb} ${event.path.length - 1} hex to ${hexKey(event.to)}.`;
    }
    case "blocked":
      return `${name(event.squadId)} could not act (${event.reason}).`;
    case "mustered":
      if (event.from === null || event.to === null) {
        return `${name(event.squadId)} shifted position in the dark.`;
      }
      return event.halted
        ? `${name(event.squadId)} mustered to ${hexKey(event.to)}, then halted: the way was barred.`
        : `${name(event.squadId)} mustered to ${hexKey(event.to)}.`;
    case "relieved":
      return `${name(event.squadId)} relieved ${name(event.relievedId)} in the line.`;
    case "engagement": {
      const lost = (id: string) =>
        `${-event.strengthChanges[id]} strength, ${-event.cohesionChanges[id]} cohesion`;
      const verb = event.charge ? "charged into" : "struck";
      return `${name(event.attackerId)} ${verb} ${name(event.defenderId)} (${name(event.defenderId)} lost ${lost(event.defenderId)}; ${name(event.attackerId)} lost ${lost(event.attackerId)}).`;
    }
    case "rally":
      return event.sourceId === null
        ? `${event.targetId === null ? "An unseen company" : name(event.targetId)} was rallied by an unseen standard (+${event.restored} cohesion).`
        : `${name(event.sourceId)} rallied ${event.targetId === null ? "an unseen company" : name(event.targetId)} (+${event.restored} cohesion).`;
    case "rout":
      return event.cause === "strength"
        ? `${name(event.squadId)} was destroyed.`
        : `${name(event.squadId)} broke and routed.`;
    case "exit":
      return `${name(event.squadId)} escaped the field.`;
    case "objectiveDamage":
      return event.attackerId === null
        ? `${objectiveName(event.objectiveId)} took ${event.oldIntegrity - event.newIntegrity} damage from an unseen company (${event.oldIntegrity} → ${event.newIntegrity}).`
        : `${name(event.attackerId)} battered ${objectiveName(event.objectiveId)} (${event.oldIntegrity} → ${event.newIntegrity}).`;
    case "outcome":
      return `${event.status === "victory" ? "Victory" : event.status === "stalemate" ? "Stalemate" : "Defeat"}: ${event.reason}`;
    case "fortune":
      return event.outcome === "surge"
        ? `Heroic stand! ${name(event.squadId)} surges forward.`
        : `Wavering… ${name(event.squadId)} hesitates and its order fails.`;
    case "dread": {
      const source = event.sourceId === null ? "an unseen banner" : name(event.sourceId);
      return `They know that banner… ${name(event.squadId)} falters before ${source}, "${event.title}" (-${event.shock} cohesion).`;
    }
    case "weatherShift":
      return `The weather turns: ${weatherName[event.from]} gives way to ${weatherName[event.to]}.`;
    case "sighted":
      return `${name(event.byId)} sighted ${name(event.squadId)} at ${hexKey(event.hex)}.`;
  }
}

export function buildReport(phase: number, intent: string, events: EngineEvent[], state: EngineState): PhaseReport {
  const title = `Phase ${phase}: ${intent}`;
  const lines = events
    .map((event) => {
      const text = narrateEvent(event, state);
      return text && event.beat > 0 ? `Beat ${event.beat}. ${text}` : text;
    })
    .filter((line): line is string => line !== null);

  return { phase, title, intent, lines, status: state.status, seed: state.seed, weather: state.weather };
}
