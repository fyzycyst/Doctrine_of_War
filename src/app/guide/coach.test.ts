import { describe, expect, it } from "vitest";
import { firstBreach } from "../../game/engine";
import { firstLesson, LESSON_WHY, lessonCopy } from "./coach";

describe("the first battle's one lesson", () => {
  it("is the one company whose default differs from the intended plan", () => {
    expect(firstLesson(firstBreach)).toEqual({ squadId: "stoneford_riders", doctrineId: "clean_counterstroke" });
    // Defaults plus the lesson are the intended plan.
    const defaults = Object.fromEntries(firstBreach.squads.filter((squad) => squad.faction === firstBreach.playerFaction).map((squad) => [squad.id, squad.doctrineId]));
    expect({ ...defaults, stoneford_riders: "clean_counterstroke" }).toEqual(firstBreach.referencePlans!.intended);
  });

  it("has its words, whichever company is selected", () => {
    const lesson = firstLesson(firstBreach)!;
    const why = LESSON_WHY[`${lesson.squadId}:${lesson.doctrineId}`];
    expect(why).toBeDefined();
    expect(lessonCopy("assign", "Stoneford Riders", "Clean Counterstroke", why, true).body).toBe(
      "Give the Stoneford Riders the Clean Counterstroke card: they'll charge any enemy that comes on alone, and the Ford Reavers will.",
    );
    expect(lessonCopy("assign", "Stoneford Riders", "Clean Counterstroke", why, false).body).toMatch(/^Select the Stoneford Riders, then give them/);
    expect(lessonCopy("select", "Stoneford Riders", "Clean Counterstroke", why, false).body).toMatch(/Pick the Stoneford Riders/);
  });

  it("is absent when more (or fewer) than one company differs", () => {
    const squads = firstBreach.squads.map((squad) => (squad.id === "greyford_shields" ? { ...squad, doctrineId: "fighting_withdrawal" } : squad));
    expect(firstLesson({ ...firstBreach, squads })).toBeNull();
    expect(firstLesson({ ...firstBreach, referencePlans: undefined })).toBeNull();
  });
});
