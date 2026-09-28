import { describe, expect, it } from "vitest";
import { doctrineLibrary, doctrines } from "./doctrines";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { firstBreach } from "./scenarios/firstBreach";
import { library, scenario, squad } from "./testKit";
import type { Doctrine, FactionId } from "./types";

/** Doctrines only non-combat squads carry: never offered to the player. */
const SPECIAL = ["keep_the_column_moving", "lie_in_wait"];
const byFaction = (faction: FactionId) => doctrines.filter((item) => item.faction === faction && !SPECIAL.includes(item.id));

describe("doctrine library", () => {
  it("has the five Free Banners doctrines and the Ashen Host doctrines", () => {
    expect(byFaction("free_banners").map((item) => item.name)).toEqual([
      "Shield the Line",
      "Fighting Withdrawal",
      "Rescue Standard",
      "Clean Counterstroke",
      "Hold for Dawn",
    ]);
    expect(byFaction("ashen_host").map((item) => item.name)).toEqual([
      "Iron Tide",
      "Break the Gate",
      "No Step Back",
      "Cull the Weak",
      "Terror Push",
      "Through the Embers",
      "Slip the Leash",
    ]);
    expect(Object.keys(doctrineLibrary)).toHaveLength(14);
    expect(doctrineLibrary.keep_the_column_moving.faction).toBe("free_banners");
  });

  it("survives a JSON round trip unchanged (data only, no functions)", () => {
    expect(JSON.parse(JSON.stringify(doctrines))).toEqual(doctrines);
    expect(JSON.parse(JSON.stringify(doctrineLibrary))).toEqual(doctrineLibrary);
    expect(JSON.parse(JSON.stringify(firstBreach))).toEqual(firstBreach);
  });

  it("gives every rule a unique id and a short player-facing label", () => {
    const ids = doctrines.flatMap((item) => item.rules.map((rule) => rule.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of doctrines.flatMap((item) => item.rules)) {
      expect(rule.label).toMatch(/→/);
      expect(rule.label.length).toBeLessThanOrEqual(70);
    }
  });

  it("ends every rule list with a catch-all so a squad always has an order", () => {
    for (const item of doctrines) {
      expect(item.rules.at(-1)?.when).toEqual({ kind: "always" });
    }
  });

  it("makes each doctrine behave visibly differently on the board", () => {
    // One subject squad carries the doctrine under test in a fixed skirmish;
    // its footprint (actions taken + where it ends up) must be unique per doctrine.
    const footprint = (subject: Doctrine) => {
      const enemy: FactionId = subject.faction === "free_banners" ? "ashen_host" : "free_banners";
      // The foe closes in on Banner subjects, and stands firm against Host subjects.
      const foeDoctrine = enemy === "ashen_host" ? "iron_tide" : "shield_the_line";
      const scen = scenario({
        playerFaction: subject.faction,
        initiativeSide: subject.faction,
        objectives: [
          { id: "prize", name: "Prize", description: "", hex: { q: 6, r: 2 }, integrity: 100, defender: subject.faction },
          { id: "target", name: "Target", description: "", hex: { q: 0, r: 2 }, integrity: 100, defender: enemy },
        ],
        // An exit beyond the foe, for doctrines that run for an edge.
        // Banner subjects retreat south; Host subjects run east past the sentry.
        winCondition: { kind: "escapeEdge", edgeHexes: [subject.faction === "free_banners" ? { q: 3, r: 4 } : { q: 6, r: 2 }], count: 99 },
        squads: [
          squad("subject", subject.faction, { q: 3, r: 2 }, { doctrineId: subject.id }),
          squad("friend", subject.faction, { q: 4, r: 3 }, { cohesion: 45 }),
          squad("foe", enemy, { q: 1, r: 2 }, { cohesion: 45, strength: 50, doctrineId: foeDoctrine }),
          squad("lone", enemy, { q: 1, r: 4 }, { cohesion: 40 }),
          // Host subjects only: a sentry beside the road to the exit.
          ...(enemy === "free_banners" ? [squad("sentry", enemy, { q: 5, r: 1 })] : []),
        ],
      });
      const { events, state } = resolvePhase(createInitialState(scen), {}, scen, { doctrines: library() });
      const actions = events.flatMap((event): string[] => {
        switch (event.kind) {
          case "move":
            return event.squadId === "subject" ? [event.reason] : [];
          case "engagement":
            return event.attackerId === "subject" ? ["strike"] : [];
          case "rally":
            return event.sourceId === "subject" ? ["rally"] : [];
          case "objectiveDamage":
            return event.attackerId === "subject" ? ["siege"] : [];
          default:
            return [];
        }
      });
      const hex = state.squads.find((item) => item.id === "subject")?.hex;
      return `${actions.join(",")}@${hex ? `${hex.q},${hex.r}` : "gone"}`;
    };

    for (const faction of ["free_banners", "ashen_host"] as const) {
      const prints = byFaction(faction).map(footprint);
      expect(new Set(prints).size, prints.join(" | ")).toBe(prints.length);
    }
  });
});
