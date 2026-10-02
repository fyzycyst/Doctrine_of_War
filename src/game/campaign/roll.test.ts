// The Roll (M1, P2): slots, assignment, the recommended force, the fixed Host threat,
// assembly, Worn/reserve/reform settlement, levies and carry-over.
import { describe, expect, it } from "vitest";
import { playBattle } from "../engine/balance";
import { createInitialState } from "../engine/resolvePhase";
import { emberFord } from "../engine/scenarios/emberFord";
import { firstBreach } from "../engine/scenarios/firstBreach";
import type { EngineState } from "../engine/types";
import { recordBattle, startCampaign } from "./campaign";
import { ashAndBanner } from "./definition";
import {
  assembleBattle,
  battleThreat,
  carryOverCandidates,
  conditionAfter,
  lintRollCampaign,
  LEVY_PROFILE,
  recommendedForce,
  rollFor,
  rollSlots,
  snapshotCarryOver,
  validateAssignment,
  WORN_PENALTY,
} from "./roll";
import { LEVY_ID, type Assignment, type CampaignDefinition, type CampaignState } from "./types";

/** A small Roll campaign over two shipped boards. */
const march: CampaignDefinition = {
  id: "test_march",
  title: "Test March",
  mode: "roll",
  companies: [
    { id: "t_shields", name: "Test Shields", role: "frontline", startingResolve: 1, profile: { strength: 84, cohesion: 74 } },
    { id: "t_bows", name: "Test Bows", role: "skirmish", profile: { strength: 66, cohesion: 70 } },
    { id: "t_banner", name: "Test Banner", role: "support", profile: { strength: 52, cohesion: 80 } },
    { id: "t_riders", name: "Test Riders", role: "cavalry", profile: { strength: 72, cohesion: 66 } },
    { id: "t_spears", name: "Test Spears", role: "frontline", profile: { strength: 78, cohesion: 70 } },
    // Arrive at the second battle.
    { id: "t_pikes", name: "Test Pikes", role: "frontline", profile: { strength: 80, cohesion: 72 }, joins: "second" },
    { id: "t_lances", name: "Test Lances", role: "cavalry", profile: { strength: 70, cohesion: 64 }, joins: "second" },
    { id: "t_levy", name: "Test Levy", role: "frontline", profile: { strength: 70, cohesion: 62 }, joins: "second" },
    { id: "t_lamps", name: "Test Lamps", role: "support", profile: { strength: 54, cohesion: 80 }, joins: "second" },
    { id: "t_archers", name: "Test Archers", role: "skirmish", profile: { strength: 64, cohesion: 68 }, joins: "second" },
  ],
  battles: [
    {
      id: "first",
      title: "First",
      scenarioId: "first_breach",
      slots: { greyford_shields: "t_shields", dawnwatch_archers: "t_bows", mercy_standard: "t_banner", stoneford_riders: "t_riders" },
      // The riders' post may also take a frontline company.
      call: { flex: { stoneford_riders: { roles: ["cavalry", "frontline"], doctrines: { cavalry: "clean_counterstroke", frontline: "shield_the_line" } } } },
    },
    {
      id: "second",
      title: "Second",
      scenarioId: "ember_ford",
      slots: {
        tollbridge_pikes: "t_pikes",
        ashfen_bowmen: "t_archers",
        kestrel_lancers: "t_lances",
        mill_lane_guard: "t_shields",
        lanternbearers: "t_lamps",
        reedmarsh_levy: "t_levy",
        harrow_riders: "t_riders",
      },
      call: { locked: { lanternbearers: "t_lamps" }, labels: { lanternbearers: "The Lantern Line" } },
    },
  ],
};

const scenarios = [firstBreach, emberFord];
const slotSquadHexes = (scenario: typeof firstBreach) =>
  scenario.squads.filter((squad) => squad.faction === scenario.playerFaction && !squad.noncombatant).map((squad) => squad.hex);

/** Fights the first battle to a victory with the given endings. */
function fightRoll2(state: CampaignState, endings: Parameters<typeof ended>[2]) {
  return fight(state, "victory", endings);
}

/** A finished engine state from `scenario` with each slot ending as given. */
function ended(scenario: ReturnType<typeof assembleBattle>, status: EngineState["status"], endings: Record<string, { status?: "active" | "routed" | "destroyed" | "escaped"; strength?: number }> = {}): EngineState {
  const state = createInitialState(scenario, { seed: 1, fortune: "off" });
  return {
    ...state,
    status,
    squads: state.squads.map((squad) => {
      const end = endings[squad.id];
      if (!end) return squad;
      const gone = end.status === "routed" || end.status === "destroyed" || end.status === "escaped";
      return { ...squad, status: end.status ?? squad.status, strength: end.strength ?? (end.status === "destroyed" ? 0 : squad.strength), hex: gone ? null : squad.hex };
    }),
  };
}

function fight(state: CampaignState, status: EngineState["status"], endings: Parameters<typeof ended>[2] = {}, assignment?: Assignment) {
  const scenario = scenarios.find((item) => item.id === march.battles[state.battleIndex].scenarioId)!;
  const force = assignment ?? recommendedForce(march, state, scenario);
  const final = ended(assembleBattle(march, state, scenario, force), status, endings);
  return recordBattle(march, state, final, { assignment: force });
}

describe("the Roll", () => {
  it("is linted clean, and the shipped intro profiles fit their bands", () => {
    expect(lintRollCampaign(march, scenarios)).toEqual([]);
    expect(lintRollCampaign({ ...ashAndBanner, mode: "roll" }, scenarios).filter((problem) => /profile/.test(problem))).toEqual([]);
  });

  it("holds the arrivals so far, fresh, at their own profiles", () => {
    const roll = rollFor(march, startCampaign(march));
    expect(roll.map((entry) => entry.company.id)).toEqual(["t_shields", "t_bows", "t_banner", "t_riders", "t_spears"]);
    expect(roll[0]).toMatchObject({ condition: "fresh", available: true, fielded: { strength: 84, cohesion: 74 }, company: { resolve: 1 } });
  });

  it("lists the slots in activation order, with the flex slot's roles and doctrines", () => {
    const slots = rollSlots(march, startCampaign(march), firstBreach);
    expect(slots.map((slot) => slot.slotId)).toEqual(["greyford_shields", "dawnwatch_archers", "mercy_standard", "stoneford_riders"]);
    expect(slots[3]).toMatchObject({ flex: true, roles: ["cavalry", "frontline"], locked: null, doctrines: { frontline: "shield_the_line" } });
    expect(slots[0]).toMatchObject({ flex: false, roles: ["frontline"], label: "Siege Approach", hex: { q: 3, r: 2 } });
  });

  it("names each post by where it stands, never by the scenario's squad", () => {
    const first = rollSlots(march, startCampaign(march), firstBreach);
    // The hex's board label, else "<terrain> · <role>".
    expect(first.map((slot) => slot.label)).toEqual(["Siege Approach", "Upper Gate Road", "Road · standard", "Road · horse"]);
    expect(first.map((slot) => slot.hex)).toEqual(slotSquadHexes(firstBreach));
    const squadNames = new Set(firstBreach.squads.map((squad) => squad.name));
    expect(first.some((slot) => squadNames.has(slot.label))).toBe(false);
    // An authored label wins.
    let state = startCampaign(march);
    state = { ...state, battleIndex: 1 };
    const second = rollSlots(march, state, emberFord);
    expect(second.find((slot) => slot.slotId === "lanternbearers")?.label).toBe("The Lantern Line");
    expect(second.find((slot) => slot.slotId === "ashfen_bowmen")?.label).toBe("Watcher's Rise");
    expect(second.find((slot) => slot.slotId === "kestrel_lancers")?.label).toBe("Field · horse");
  });

  it("recommends a legal force and explains every illegal one", () => {
    const state = startCampaign(march);
    const recommended = recommendedForce(march, state, firstBreach);
    expect(validateAssignment(march, state, firstBreach, recommended)).toEqual({});
    const bad = (patch: Record<string, string>) => validateAssignment(march, state, firstBreach, { ...recommended, ...patch });
    expect(bad({ greyford_shields: "t_riders" })).toMatchObject({ greyford_shields: "Test Riders (cavalry) cannot hold a frontline post." });
    expect(bad({ dawnwatch_archers: recommended.greyford_shields })).toMatchObject({ dawnwatch_archers: "Test Shields already holds Siege Approach." });
    expect(bad({ mercy_standard: "t_pikes" })).toMatchObject({ mercy_standard: "That company is not on the Roll." });
    expect(bad({ mercy_standard: LEVY_ID })).toMatchObject({ mercy_standard: expect.stringMatching(/a levy is only raised when no company can/) });
    expect(bad({ nowhere: "t_spears" })).toMatchObject({ assignment: "One post is not part of this battle." });
    const { stoneford_riders: _gone, ...missing } = recommended;
    expect(validateAssignment(march, state, firstBreach, missing)).toMatchObject({ stoneford_riders: "Road · horse has no company." });
    // The flex slot takes a frontline company.
    expect(bad({ stoneford_riders: "t_spears" })).toEqual({});
  });

  it("names posts in every problem only by their position label, never by squad id or squad name", () => {
    let state = startCampaign(march);
    state = fightRoll2(state, { mercy_standard: { status: "destroyed" } });
    const slots = rollSlots(march, state, emberFord);
    const squadWords = emberFord.squads.flatMap((squad) => [squad.id, squad.name]);
    const attempts: Assignment[] = [
      {},
      { ...recommendedForce(march, state, emberFord), tollbridge_pikes: "t_riders" },
      { ...recommendedForce(march, state, emberFord), ashfen_bowmen: recommendedForce(march, state, emberFord).tollbridge_pikes },
      { ...recommendedForce(march, state, emberFord), mill_lane_guard: "t_banner" },
      { ...recommendedForce(march, state, emberFord), lanternbearers: "t_spears" },
      { ...recommendedForce(march, state, emberFord), kestrel_lancers: LEVY_ID },
      { ...recommendedForce(march, state, emberFord), reedmarsh_levy: "ghost", stray_post: "t_spears" },
    ];
    const texts = attempts.flatMap((attempt) => Object.values(validateAssignment(march, state, emberFord, attempt)));
    expect(texts.length).toBeGreaterThan(8);
    for (const text of texts) {
      for (const word of squadWords) expect(text, text).not.toContain(word);
    }
    // ...and they do name the posts.
    expect(texts.some((text) => slots.some((slot) => text.includes(slot.label)))).toBe(true);
  });

  it("assembles the battle: order kept, each company's identity, Worn penalty and the flex doctrine; pure", () => {
    const state = startCampaign(march);
    const assignment = { ...recommendedForce(march, state, firstBreach), stoneford_riders: "t_spears" };
    const pristine = structuredClone(firstBreach);
    const scenario = assembleBattle(march, state, firstBreach, assignment);
    expect(firstBreach).toEqual(pristine);
    expect(scenario.squads.map((squad) => squad.id)).toEqual(firstBreach.squads.map((squad) => squad.id));
    expect(scenario.squads.find((squad) => squad.id === "stoneford_riders")).toMatchObject({
      name: "Test Spears",
      role: "frontline",
      strength: 78,
      cohesion: 70,
      resolve: 0,
      doctrineId: "shield_the_line",
    });
    expect(scenario.squads.find((squad) => squad.id === "greyford_shields")).toMatchObject({ name: "Test Shields", strength: 84, resolve: 1 });
    expect(() => assembleBattle(march, state, firstBreach, { ...assignment, greyford_shields: "t_riders" })).toThrow(/Invalid assignment for greyford_shields/);
    // It plays.
    expect(["victory", "defeat", "stalemate"]).toContain(playBattle(scenario, scenario.referencePlans!.intended, 1, "on").status);
  });

  it("fixes the Host's threat at battle entry: the same whoever is picked", () => {
    const state = startCampaign(march);
    const recommended = recommendedForce(march, state, firstBreach);
    const threat = battleThreat(march, state, firstBreach);
    const host = (assignment: Assignment) =>
      assembleBattle(march, state, firstBreach, assignment)
        .squads.filter((squad) => squad.faction === "ashen_host")
        .map((squad) => [squad.strength, squad.resolve]);
    expect(host({ ...recommended, stoneford_riders: "t_spears" })).toEqual(host(recommended));
    expect(host(recommended)).toEqual(
      firstBreach.squads.filter((squad) => squad.faction === "ashen_host").map((squad) => [Math.min(100, Math.max(10, squad.strength + threat.strength)), Math.max(-3, Math.min(3, squad.resolve + threat.resolve))]),
    );
    // A defeat changes nothing the threat reads, so a retry faces the same Host.
    const retry = fight(state, "defeat", { greyford_shields: { status: "routed" } });
    expect(retry.battleIndex).toBe(0);
    expect(battleThreat(march, retry, firstBreach)).toEqual(threat);
  });
});

describe("Worn, reserves and reform (B2)", () => {
  it("decides a fielded company's condition: destroyed > routed > under half its starting strength", () => {
    expect(conditionAfter("fresh", "destroyed", 80, 0)).toBe("reforming");
    expect(conditionAfter("fresh", "routed", 80, 70)).toBe("worn");
    expect(conditionAfter("fresh", "active", 80, 39)).toBe("worn");
    expect(conditionAfter("fresh", "active", 80, 40)).toBe("fresh");
    expect(conditionAfter("fresh", "escaped", 80, 30)).toBe("worn");
    expect(conditionAfter("worn", "active", 65, 60)).toBe("worn"); // only rest clears Worn
    expect(conditionAfter("reforming", "active", 65, 60)).toBe("worn"); // a locked-in reformer fought tired
  });

  it("settles on an advancing battle, rests the reserve, and changes nobody on a defeat", () => {
    const start = startCampaign(march);
    const assignment = recommendedForce(march, start, firstBreach); // t_spears sits in reserve
    const lost = fight(start, "defeat", { greyford_shields: { status: "routed" }, dawnwatch_archers: { status: "destroyed" } }, assignment);
    expect(lost.companies.every((company) => company.condition === "fresh")).toBe(true);
    expect(lost.history[0]).toMatchObject({ outcome: "defeat", assignment, companies: expect.arrayContaining([expect.objectContaining({ endStrength: 0, companyId: assignment.dawnwatch_archers })]) });

    const won = fight(lost, "victory", {
      greyford_shields: { status: "routed" },
      dawnwatch_archers: { status: "destroyed" },
      mercy_standard: { strength: 20 },
    }, assignment);
    const by = (id: string) => won.companies.find((company) => company.id === id)!;
    expect(by(assignment.greyford_shields).condition).toBe("worn");
    expect(by(assignment.dawnwatch_archers)).toMatchObject({ condition: "reforming", resolve: -2, renown: null });
    expect(by(assignment.mercy_standard).condition).toBe("worn");
    expect(by(assignment.stoneford_riders).condition).toBe("fresh");
    expect(won.history.at(-1)?.companies.find((line) => line.squadId === "mercy_standard")).toMatchObject({ startStrength: 52, endStrength: 20 });
    // The Roll now holds the second battle's arrivals too.
    expect(rollFor(march, won).map((entry) => entry.company.id)).toContain("t_pikes");
    return won;
  });

  it("fields Worn companies at the penalty, keeps Reforming ones out unless story-locked, and rests both in reserve", () => {
    let state = startCampaign(march);
    const assignment = recommendedForce(march, state, firstBreach);
    state = fight(state, "victory", { greyford_shields: { status: "routed" }, mercy_standard: { status: "destroyed" } }, assignment);
    const shields = assignment.greyford_shields;
    const roll = rollFor(march, state);
    expect(roll.find((entry) => entry.company.id === shields)).toMatchObject({
      condition: "worn",
      available: true,
      fielded: { strength: 84 - WORN_PENALTY.strength, cohesion: 74 - WORN_PENALTY.cohesion },
    });
    expect(roll.find((entry) => entry.company.id === "t_banner")).toMatchObject({ condition: "reforming", available: false, unavailableReason: "Reforming: sits out this battle." });

    // The recommended force rests the Worn and leaves the reformer out.
    const next = recommendedForce(march, state, emberFord);
    expect(Object.values(next)).not.toContain("t_banner");
    expect(validateAssignment(march, state, emberFord, next)).toEqual({});
    expect(validateAssignment(march, state, emberFord, { ...next, lanternbearers: "t_banner" })).toMatchObject({ lanternbearers: "Test Lamps must hold The Lantern Line." });
    const worn = { ...next, mill_lane_guard: shields };
    const field = assembleBattle(march, state, emberFord, worn).squads.find((squad) => squad.id === "mill_lane_guard")!;
    expect([field.strength, field.cohesion]).toEqual([84 - WORN_PENALTY.strength, 74 - WORN_PENALTY.cohesion]);

    const after = fight(state, "victory", {}, next);
    expect(after.companies.find((company) => company.id === "t_banner")?.condition).toBe("fresh");
    expect(after.companies.find((company) => company.id === shields)?.condition).toBe(Object.values(next).includes(shields) ? "worn" : "fresh");
  });

  it("raises a levy only where no company can hold the post, and never settles it", () => {
    const thin: CampaignDefinition = { ...march, companies: march.companies.filter((company) => company.id !== "t_spears"), battles: [march.battles[0]] };
    let state = startCampaign(thin);
    // Destroy the only support company, then fight a second time with it reforming.
    const twice: CampaignDefinition = { ...thin, battles: [thin.battles[0], { ...thin.battles[0], id: "again" }] };
    state = startCampaign(twice);
    const first = recommendedForce(twice, state, firstBreach);
    const final = ended(assembleBattle(twice, state, firstBreach, first), "victory", { mercy_standard: { status: "destroyed" } });
    state = recordBattle(twice, state, final, { assignment: first });
    const forced = recommendedForce(twice, state, firstBreach);
    expect(forced.mercy_standard).toBe(LEVY_ID);
    expect(validateAssignment(twice, state, firstBreach, forced)).toEqual({});
    const levy = assembleBattle(twice, state, firstBreach, forced).squads.find((squad) => squad.id === "mercy_standard")!;
    expect(levy).toMatchObject({ name: "Support Levy", resolve: -1, ...LEVY_PROFILE.support });
    expect(levy.renown).toBeUndefined();
    const end = recordBattle(twice, state, ended(assembleBattle(twice, state, firstBreach, forced), "victory"), { assignment: forced });
    expect(end.history.at(-1)?.companies.find((line) => line.squadId === "mercy_standard")).toMatchObject({ companyId: LEVY_ID, levy: true });
    expect(end.companies.some((company) => company.id === LEVY_ID)).toBe(false);
    expect(end.status).toBe("complete");
  });

  it("insists on the assignment for a Roll battle", () => {
    const state = startCampaign(march);
    const final = ended(assembleBattle(march, state, firstBreach, recommendedForce(march, state, firstBreach)), "victory");
    expect(() => recordBattle(march, state, final)).toThrow(/needs the assignment/);
  });
});

describe("carry-over", () => {
  /** A completed intro run (state built directly: the rules under test are carry-over's). */
  const finished: CampaignState = {
    campaignId: "ash_and_banner",
    battleIndex: 4,
    status: "complete",
    history: [],
    companies: [
      { id: "greyford_shields", name: "Greyford Shields", role: "frontline", resolve: 3, renown: { title: "The Steadfast" }, battlesFought: 4, casualties: { routed: 0, destroyed: 0 }, reformed: 0 },
      { id: "stoneford_riders", name: "Stoneford Riders", role: "cavalry", resolve: -3, renown: null, battlesFought: 4, casualties: { routed: 2, destroyed: 0 }, reformed: 0 },
      { id: "mercy_standard", name: "Mercy Standard", role: "support", resolve: 1, renown: null, battlesFought: 4, casualties: { routed: 0, destroyed: 0 }, reformed: 0 },
    ],
  };
  const source = { def: ashAndBanner, state: finished, packId: "first_call" };

  it("offers a completed campaign's companies with Resolve clamped to -1..+2 and renown kept", () => {
    const candidates = carryOverCandidates(ashAndBanner, finished, "first_call");
    expect(candidates[0]).toEqual({
      id: "greyford_shields",
      name: "Greyford Shields",
      role: "frontline",
      realm: "greyford_march",
      profile: { strength: 86, cohesion: 76 },
      resolve: 2,
      renown: { title: "The Steadfast" },
      from: { packId: "first_call", campaignId: "ash_and_banner" },
    });
    expect(candidates[1].resolve).toBe(-1);
    expect(carryOverCandidates(ashAndBanner, { ...finished, status: "inProgress" }, "first_call")).toEqual([]);
  });

  it("carries each company's home realm, from the definition, into the new Roll", () => {
    const carried = snapshotCarryOver(source, march, ["greyford_shields", "mercy_standard"]);
    expect(carried.map((item) => item.realm)).toEqual(["greyford_march", "fenwardens"]);
    const roll = rollFor(march, startCampaign(march, { carryOver: carried }));
    expect(roll[0].company.realm).toBe("greyford_march");
    expect(ashAndBanner.companies.every((company) => company.realm !== undefined)).toBe(true);
  });

  it("validates the pick and snapshots it into the new run's Roll", () => {
    const carried = snapshotCarryOver(source, march, ["greyford_shields", "mercy_standard"]);
    const state = startCampaign(march, { carryOver: carried });
    expect(state.carried).toEqual(carried);
    const roll = rollFor(march, state);
    expect(roll.slice(0, 2).map((entry) => entry.company.id)).toEqual(["greyford_shields", "mercy_standard"]);
    expect(roll[0].company).toMatchObject({ resolve: 2, renown: { title: "The Steadfast" }, carriedFrom: { campaignId: "ash_and_banner" }, profile: { strength: 86, cohesion: 76 } });
    // A carried veteran counts toward the Host's threat like any other (it is recommended).
    expect(Object.values(recommendedForce(march, state, firstBreach))).toContain("greyford_shields");
    expect(battleThreat(march, state, firstBreach).fame).toBeGreaterThan(battleThreat(march, startCampaign(march), firstBreach).fame);

    expect(() => snapshotCarryOver(source, march, ["a", "b", "c", "d", "e", "f"])).toThrow(/At most 5/);
    expect(() => snapshotCarryOver(source, march, ["greyford_shields", "greyford_shields"])).toThrow(/only be chosen once/);
    expect(() => snapshotCarryOver(source, march, ["ghost"])).toThrow(/cannot march on/);
    expect(() => snapshotCarryOver({ ...source, state: { ...finished, status: "inProgress" } }, march, [])).toThrow(/not complete/);
    expect(() => snapshotCarryOver(source, ashAndBanner, [])).toThrow(/does not take companies/);
    const clash: CampaignDefinition = { ...march, companies: [...march.companies, { id: "greyford_shields", name: "Greyford Shields", role: "frontline", profile: { strength: 80, cohesion: 70 } }] };
    expect(() => snapshotCarryOver(source, clash, ["greyford_shields"])).toThrow(/already part of/);
    expect(() => startCampaign(ashAndBanner, { carryOver: carried })).toThrow(/does not take carried companies/);
  });
});

describe("lintRollCampaign", () => {
  it("catches profiles out of band, too many flex slots, bad locks and early companies", () => {
    const broken: CampaignDefinition = structuredClone(march);
    broken.companies[1].profile = { strength: 95, cohesion: 70 };
    broken.companies[0].joins = "nowhere";
    broken.battles[0].call = {
      flex: {
        greyford_shields: { roles: ["frontline", "cavalry"], doctrines: { frontline: "shield_the_line" } },
        dawnwatch_archers: { roles: ["skirmish", "frontline"], doctrines: { skirmish: "clean_counterstroke", frontline: "shield_the_line" } },
        stoneford_riders: { roles: ["frontline", "cavalry"], doctrines: { frontline: "shield_the_line", cavalry: "iron_tide" } },
      },
      locked: { mercy_standard: "t_pikes" },
    };
    expect(lintRollCampaign(broken, scenarios)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/company t_bows: profile 95\/70 is outside the skirmish band/),
        "company t_shields joins at unknown battle nowhere",
        "first: has 3 flex slots (at most 2)",
        "first: flex slot greyford_shields has no doctrine for cavalry",
        "first: flex slot stoneford_riders must list its own role (cavalry) first",
        "first: flex slot stoneford_riders: iron_tide is not a player doctrine here",
        "first: locked company t_pikes has not joined the Roll by this battle",
      ]),
    );
  });

  it("checks authored post labels: real slots, short plain names, never a company's name", () => {
    const labelled: CampaignDefinition = structuredClone(march);
    labelled.battles[0].call = {
      ...labelled.battles[0].call,
      labels: { ghost_post: "Nowhere", greyford_shields: " The Gate", dawnwatch_archers: "x".repeat(41), mercy_standard: "Test Banner", stoneford_riders: "<b>Riders</b>" },
    };
    expect(lintRollCampaign(labelled, scenarios)).toEqual(
      expect.arrayContaining([
        "first: label for ghost_post, which is not a player squad",
        "first: label for greyford_shields must be a plain name of 1..40 characters",
        "first: label for dawnwatch_archers must be a plain name of 1..40 characters",
        'first: label for mercy_standard is a company\'s name ("Test Banner")',
        "first: label for stoneford_riders must be a plain name of 1..40 characters",
      ]),
    );
  });
});
