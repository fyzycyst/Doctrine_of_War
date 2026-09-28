import { describe, expect, it } from "vitest";
import { createInitialState, eventsFor, firstBreach, resolvePhase, visibleState, type EngineEvent } from "../../game/engine";
import { buildChronicle, describeEvent, firedOrders, namesFor } from "./chronicle";

const start = visibleState(createInitialState(firstBreach, { fortune: "off" }), "free_banners");
const names = namesFor([start]);
const base = { phase: 1, beat: 2, visibleTo: ["free_banners" as const] };

describe("chronicle lines", () => {
  it("tells a clash in a few words with stat chips for each side", () => {
    const line = describeEvent(
      {
        ...base,
        kind: "engagement",
        attackerId: "cinder_vanguard",
        defenderId: "dawnwatch_archers",
        attackerHex: { q: 1, r: 2 },
        defenderHex: { q: 2, r: 1 },
        charge: false,
        reckless: false,
        strengthChanges: { dawnwatch_archers: -3, cinder_vanguard: -2 },
        cohesionChanges: { dawnwatch_archers: -11, cinder_vanguard: -1 },
      },
      names,
    )!;
    expect(line.text).toBe("Cinder Vanguard struck Dawnwatch Archers");
    expect(line.chips.map((chip) => chip.text)).toEqual(["−3 STR", "−11 COH"]);
    expect(line.riposte?.map((chip) => chip.text)).toEqual(["−2 STR", "−1 COH"]);
  });

  it("names hidden actors as an unseen company", () => {
    const line = describeEvent({ ...base, kind: "rally", sourceId: null, targetId: "cinder_vanguard", restored: 12 }, names)!;
    expect(line.text).toBe("An unseen company rallied Cinder Vanguard");
    expect(line.chips[0]).toEqual({ text: "+12 COH", tone: "gain" });
  });

  it("names only squads the player's views contain", () => {
    const blind = namesFor([{ ...start, squads: start.squads.filter((squad) => squad.faction === "free_banners") }]);
    expect(blind.name("cinder_vanguard")).toBe("an unseen company");
    expect(blind.name("greyford_shields")).toBe("Greyford Shields");
  });
});

describe("buildChronicle", () => {
  const { events, state } = resolvePhase(createInitialState(firstBreach, { fortune: "off" }), {}, firstBreach);
  const projected = eventsFor(events, "free_banners");
  const beats = buildChronicle(projected, namesFor([start, visibleState(state, "free_banners")]));

  it("collapses each beat's exchanges of blows into one group with totals", () => {
    const engagements = projected.filter((event) => event.kind === "engagement");
    const grouped = beats.flatMap((beat) => beat.blows?.lines ?? []);
    expect(grouped).toHaveLength(engagements.length);
    for (const beat of beats) {
      expect(beat.story.every((line) => line.tone !== "clash")).toBe(true);
      if (beat.blows) {
        expect(beat.blows.yours.strength).toBeLessThanOrEqual(0);
        expect(beat.blows.theirs.strength).toBeLessThanOrEqual(0);
      }
    }
  });

  it("tells a rule firing only when a company changes what it does", () => {
    const rule = (squadId: string, ruleId: string, beat: number): EngineEvent => ({
      ...base,
      beat,
      kind: "ruleFired",
      squadId,
      doctrineId: "shield_the_line",
      ruleId,
      label: `${ruleId} → act`,
    });
    const story = buildChronicle(
      [rule("greyford_shields", "a", 1), rule("greyford_shields", "a", 2), rule("greyford_shields", "b", 3), rule("cinder_vanguard", "x", 1), rule("cinder_vanguard", "y", 2)],
      names,
    ).flatMap((beat) => beat.story);
    expect(story.map((line) => line.text)).toEqual(["Greyford Shields: b → act"]);
  });

  it("counts fired orders per company, player first", () => {
    const fired = firedOrders(projected, names);
    expect(fired[0].mine).toBe(true);
    expect(fired.every((group) => group.rules.every((rule) => rule.count >= 1))).toBe(true);
  });
});
