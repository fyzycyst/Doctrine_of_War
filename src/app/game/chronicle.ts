// The phase chronicle: short narrative lines with stat chips, built from the player's
// projected event stream. Companies are named only from what the player saw (the
// phase's visible states), never from engine state. Ids the projection hid (null), or
// squads never seen, read as "an unseen company".
import type { EngineEvent, FactionId, VisibleState, Weather } from "../../game/engine";
import { WEATHER_NAME } from "./view";

export type ChronicleTone =
  | "order"
  | "clash"
  | "rally"
  | "rout"
  | "surge"
  | "waver"
  | "dread"
  | "sight"
  | "weather"
  | "siege"
  | "outcome";

export interface Chip {
  text: string;
  tone: "loss" | "gain" | "neutral";
}

export interface ChronicleLine {
  key: string;
  beat: number;
  tone: ChronicleTone;
  text: string;
  /** The effect on the company the line is about (the defender, for a clash). */
  chips: Chip[];
  /** A clash's cost to the attacker. */
  riposte?: Chip[];
}

export interface Losses {
  strength: number;
  cohesion: number;
}

export interface ChronicleBeat {
  beat: number;
  /** What changed the battle: decisions, fortune, dread, rallies, routs, the gate. */
  story: ChronicleLine[];
  /** Routine exchanges of blows, collapsed into one line with totals. */
  blows: { lines: ChronicleLine[]; yours: Losses; theirs: Losses } | null;
}

/** The standing orders one company was seen to fire this phase. */
export interface FiredOrders {
  squadId: string;
  squadName: string;
  mine: boolean;
  rules: { label: string; count: number }[];
}

export interface Names {
  name: (id: string | null) => string;
  faction: (id: string | null) => FactionId | undefined;
  objective: (id: string) => string;
  player: FactionId;
}

/** Names from the player's views of a phase (typically its start and its end). */
export function namesFor(views: VisibleState[]): Names {
  const squads = new Map(views.flatMap((view) => view.squads).map((squad) => [squad.id, squad]));
  const objectives = new Map(views.flatMap((view) => view.objectives).map((objective) => [objective.id, objective]));
  return {
    name: (id) => (id ? squads.get(id)?.name : undefined) ?? "an unseen company",
    faction: (id) => (id ? squads.get(id)?.faction : undefined),
    objective: (id) => objectives.get(id)?.name ?? "the objective",
    player: views[0]?.viewer ?? "free_banners",
  };
}

const capitalize = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

export function statChip(delta: number, unit: string): Chip {
  return {
    text: `${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${unit}`,
    tone: delta > 0 ? "gain" : delta < 0 ? "loss" : "neutral",
  };
}

function lossChips(strength: number | undefined, cohesion: number | undefined): Chip[] {
  return [
    ...(strength ? [statChip(strength, "STR")] : []),
    ...(cohesion ? [statChip(cohesion, "COH")] : []),
  ];
}

const WEATHER_WORD: Record<Weather, string> = { clear: "clear skies", rain: "rain", mist: "mist", ashWind: "ash-wind" };

/** One event as a short line, or null for events that are only playback detail. */
export function describeEvent(event: EngineEvent, names: Names, key = ""): ChronicleLine | null {
  const line = (tone: ChronicleTone, text: string, chips: Chip[] = []): ChronicleLine => ({
    key,
    beat: event.beat,
    tone,
    text: capitalize(text),
    chips,
  });
  switch (event.kind) {
    case "ruleFired":
      return line("order", `${names.name(event.squadId)}: ${event.label}`);
    case "engagement": {
      const verb = event.charge ? (event.reckless ? "charged recklessly into" : "charged") : "struck";
      return {
        ...line(
          "clash",
          `${names.name(event.attackerId)} ${verb} ${names.name(event.defenderId)}`,
          lossChips(event.strengthChanges[event.defenderId], event.cohesionChanges[event.defenderId]),
        ),
        riposte: lossChips(event.strengthChanges[event.attackerId], event.cohesionChanges[event.attackerId]),
      };
    }
    case "rally":
      return line("rally", `${names.name(event.sourceId)} rallied ${names.name(event.targetId)}`, [
        statChip(event.restored, "COH"),
      ]);
    case "rout":
      return line(
        "rout",
        event.cause === "strength" ? `${names.name(event.squadId)} was destroyed` : `${names.name(event.squadId)} broke and fled`,
      );
    case "exit":
      return line("rout", `${names.name(event.squadId)} escaped the field`);
    case "objectiveDamage":
      return line("siege", `${names.name(event.attackerId)} battered ${names.objective(event.objectiveId)}`, [
        { text: `${event.oldIntegrity} → ${event.newIntegrity}`, tone: "loss" },
      ]);
    case "fortune":
      return event.outcome === "surge"
        ? line("surge", `Heroic stand! ${names.name(event.squadId)} surges`, [statChip(5, "COH")])
        : line("waver", `Wavering… ${names.name(event.squadId)}'s order fails`);
    case "dread":
      return line("dread", `They know that banner… ${names.name(event.squadId)} falters before “${event.title}”`, [
        statChip(-event.shock, "COH"),
      ]);
    case "sighted":
      return line("sight", `${names.name(event.byId)} sighted ${names.name(event.squadId)}`);
    case "weatherShift":
      return line("weather", `The weather turns: ${WEATHER_WORD[event.from]} gives way to ${WEATHER_WORD[event.to]}`, [
        { text: WEATHER_NAME[event.to], tone: "neutral" },
      ]);
    case "outcome":
      return line("outcome", `${capitalize(event.status)}: ${event.reason}`);
    case "move":
    case "blocked":
      return null;
  }
}

/**
 * The chronicle, beat by beat. A player company's rule firing is a story line only
 * when it changes what the company does (its first firing is in the orders summary).
 * Exchanges of blows collapse into one line per beat with your and their losses.
 */
export function buildChronicle(events: EngineEvent[], names: Names): ChronicleBeat[] {
  const lastRule = new Map<string, string>();
  const beats = new Map<number, ChronicleBeat>();
  const beatOf = (beat: number) => {
    let entry = beats.get(beat);
    if (!entry) {
      entry = { beat, story: [], blows: null };
      beats.set(beat, entry);
    }
    return entry;
  };

  events.forEach((event, index) => {
    if (event.kind === "ruleFired") {
      const previous = lastRule.get(event.squadId);
      lastRule.set(event.squadId, event.ruleId);
      if (previous === undefined || previous === event.ruleId || names.faction(event.squadId) !== names.player) {
        return;
      }
    }
    const line = describeEvent(event, names, `${index}-${event.kind}`);
    if (!line) {
      return;
    }
    const beat = beatOf(event.beat);
    if (event.kind !== "engagement") {
      beat.story.push(line);
      return;
    }
    beat.blows ??= { lines: [], yours: { strength: 0, cohesion: 0 }, theirs: { strength: 0, cohesion: 0 } };
    beat.blows.lines.push(line);
    for (const [id, delta] of Object.entries(event.strengthChanges)) {
      (names.faction(id) === names.player ? beat.blows.yours : beat.blows.theirs).strength += delta;
    }
    for (const [id, delta] of Object.entries(event.cohesionChanges)) {
      (names.faction(id) === names.player ? beat.blows.yours : beat.blows.theirs).cohesion += delta;
    }
  });

  return [...beats.values()].sort((a, b) => a.beat - b.beat);
}

/** Which standing orders fired this phase, grouped by company, player companies first. */
export function firedOrders(events: EngineEvent[], names: Names): FiredOrders[] {
  const bySquad = new Map<string, FiredOrders>();
  for (const event of events) {
    if (event.kind !== "ruleFired") {
      continue;
    }
    let group = bySquad.get(event.squadId);
    if (!group) {
      group = {
        squadId: event.squadId,
        squadName: names.name(event.squadId),
        mine: names.faction(event.squadId) === names.player,
        rules: [],
      };
      bySquad.set(event.squadId, group);
    }
    const rule = group.rules.find((item) => item.label === event.label);
    if (rule) {
      rule.count += 1;
    } else {
      group.rules.push({ label: event.label, count: 1 });
    }
  }
  return [...bySquad.values()].sort((a, b) => Number(b.mine) - Number(a.mine));
}
