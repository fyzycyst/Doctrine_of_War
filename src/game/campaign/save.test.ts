import { describe, expect, it } from "vitest";
import { playBattle } from "../engine/balance";
import { scenarios } from "../engine/scenarios";
import { firstBreach } from "../engine/scenarios/firstBreach";
import { applyCampaign, currentBattle, recordBattle, startCampaign } from "./campaign";
import { ashAndBanner } from "./definition";
import { CampaignSaveError, loadCampaign, MAX_SAVE_BYTES, saveCampaign, SAVE_VERSION } from "./save";
import type { CampaignState } from "./types";

function afterTutorial(): CampaignState {
  const state = startCampaign(ashAndBanner);
  const scenario = applyCampaign(ashAndBanner, state, firstBreach);
  const final = playBattle(scenario, firstBreach.referencePlans!.intended, firstBreach.curatedSeed!, "on");
  return recordBattle(ashAndBanner, state, final);
}

/** Plays on from `state` with the given plan names, one battle per plan, whatever the outcomes. */
function playOn(state: CampaignState, plans: ("intended" | "bad")[], seed = 11): CampaignState {
  for (const plan of plans) {
    const battle = currentBattle(ashAndBanner, state);
    if (!battle || battle.placeholder) break;
    const base = scenarios.find((item) => item.id === battle.scenarioId)!;
    const final = playBattle(applyCampaign(ashAndBanner, state, base), base.referencePlans![plan], seed, "on");
    state = recordBattle(ashAndBanner, state, final);
    seed += 1;
  }
  return state;
}

const envelope = (campaign: unknown) => JSON.stringify({ version: SAVE_VERSION, campaign });

describe("campaign saves", () => {
  it("round-trips a real campaign exactly", () => {
    const state = afterTutorial();
    const json = saveCampaign(state);
    expect(JSON.parse(json).version).toBe(1);
    expect(loadCampaign(json, ashAndBanner)).toEqual(state);
    expect(loadCampaign(json)).toEqual(state);
  });

  it("round-trips a fresh campaign", () => {
    const state = startCampaign(ashAndBanner);
    expect(loadCampaign(saveCampaign(state), ashAndBanner)).toEqual(state);
  });

  describe("fails closed on malformed input", () => {
    const good = afterTutorial();
    const cases: [string, unknown][] = [
      ["not a string", 42],
      ["not JSON", "{campaign"],
      ["a JSON array", "[]"],
      ["no version", JSON.stringify({ campaign: good })],
      ["a future version", JSON.stringify({ version: 2, campaign: good })],
      ["no campaign", JSON.stringify({ version: 1 })],
      ["Resolve out of range", envelope({ ...good, companies: [{ ...good.companies[0], resolve: 4 }] })],
      ["fractional Resolve", envelope({ ...good, companies: [{ ...good.companies[0], resolve: 1.5 }] })],
      ["a bad company id", envelope({ ...good, companies: [{ ...good.companies[0], id: "../etc/passwd" }] })],
      ["an unknown role", envelope({ ...good, companies: [{ ...good.companies[0], role: "dragon" }] })],
      ["duplicate companies", envelope({ ...good, companies: [good.companies[0], good.companies[0]] })],
      ["a missing field", envelope({ ...good, companies: [{ ...good.companies[0], casualties: undefined }] })],
      ["a bad outcome", envelope({ ...good, history: [{ ...good.history[0], outcome: "triumph" }] })],
      ["a negative battle index", envelope({ ...good, battleIndex: -1 })],
      ["an unknown status", envelope({ ...good, status: "paused" })],
      ["oversized", envelope({ ...good, padding: "x".repeat(MAX_SAVE_BYTES) })],
    ];
    for (const [label, input] of cases) {
      it(`rejects ${label}`, () => {
        expect(() => loadCampaign(input, ashAndBanner)).toThrow(CampaignSaveError);
      });
    }

    it("rejects saves that do not fit this campaign", () => {
      expect(() => loadCampaign(envelope({ ...good, campaignId: "other_war" }), ashAndBanner)).toThrow(/campaignId/);
      expect(() => loadCampaign(envelope({ ...good, battleIndex: 9 }), ashAndBanner)).toThrow(/battleIndex/);
      expect(() => loadCampaign(envelope({ ...good, status: "complete" }), ashAndBanner)).toThrow(/does not match/);
      const stranger = { ...good.companies[0], id: "hired_blades" };
      expect(() => loadCampaign(envelope({ ...good, companies: [...good.companies, stranger] }), ashAndBanner)).toThrow(/unknown company/);
      expect(() => loadCampaign(envelope({ ...good, history: [{ ...good.history[0], battleId: "battle_9" }] }), ashAndBanner)).toThrow(/unknown battle/);
    });
  });

  it("round-trips a longer real campaign, retries included", () => {
    const outcomes = new Set<string>();
    for (const seed of [3, 11, 29]) {
      const state = playOn(startCampaign(ashAndBanner), ["bad", "intended", "bad", "bad", "intended", "intended"], seed);
      expect(state.history.length).toBeGreaterThan(1);
      state.history.forEach((entry) => outcomes.add(entry.outcome));
      expect(loadCampaign(saveCampaign(state), ashAndBanner)).toEqual(state);
    }
    expect(outcomes).toContain("defeat");
  });

  describe("rejects saves that could not have been played", () => {
    const good = afterTutorial();
    const fresh = startCampaign(ashAndBanner);
    const tutorial = good.history[0];
    const shields = good.companies.find((item) => item.id === "greyford_shields")!;
    const withCompany = (patch: Partial<CampaignState["companies"][number]>) =>
      envelope({ ...good, companies: good.companies.map((item) => (item.id === shields.id ? { ...item, ...patch } : item)) });
    const withLines = (lines: unknown[]) => envelope({ ...good, history: [{ ...tutorial, companies: lines }] });
    const cases: [string, string, RegExp][] = [
      // Review probe: a fresh campaign carrying a tutorial victory fought on Ember Ford's map.
      ["a result on the wrong scenario", envelope({ ...fresh, history: [{ ...tutorial, scenarioId: "ember_ford" }] }), /scenarioId/],
      ["a result for a future battle", envelope({ ...good, history: [{ ...tutorial, battleId: "battle_1", scenarioId: "ember_ford" }] }), /battleId/],
      ["a result for a placeholder battle", envelope({ ...good, battleIndex: 2, history: [...good.history, { ...tutorial, battleId: "battle_1", scenarioId: "ember_ford" }, { ...tutorial, battleId: "battle_2", scenarioId: "saltmarsh_column" }] }), /battle|companies/],
      ["an attempt number out of sequence", envelope({ ...good, history: [{ ...tutorial, attempt: 2 }] }), /attempt/],
      ["a battleIndex the history does not reach", envelope({ ...fresh, battleIndex: 1 }), /battleIndex/],
      ["a roster with no history", envelope({ ...fresh, companies: good.companies }), /companies/],
      ["a company missing from the roster", envelope({ ...good, companies: good.companies.slice(1) }), /companies/],
      // Review probe: the Greyford Shields cannot be siege engineers.
      ["a company with the wrong role", withCompany({ role: "siege" }), /companies\[0\]/],
      ["a renamed company", withCompany({ name: "Hired Blades" }), /companies\[0\]/],
      ["a Resolve the history does not produce", withCompany({ resolve: shields.resolve === 3 ? 2 : 3 }), /companies\[0\]/],
      ["an invented renown title", withCompany({ renown: { title: "The Invincible" } }), /companies\[0\]/],
      ["inflated counters", withCompany({ battlesFought: 5 }), /companies\[0\]/],
      ["duplicate company results", withLines([tutorial.companies[0], ...tutorial.companies.slice(0, -1)]), /companies/],
      ["a company in the wrong slot", withLines(tutorial.companies.map((line, index) => ({ ...line, companyId: tutorial.companies[(index + 1) % 4].companyId }))), /slot/],
      ["a doctored Resolve change", withLines(tutorial.companies.map((line, index) => (index === 0 ? { ...line, resolveAfter: line.resolveAfter === 3 ? 2 : 3 } : line))), /Resolve after/],
      ["a miscounted companiesBroken", envelope({ ...good, history: [{ ...tutorial, companiesBroken: (tutorial.companiesBroken + 1) % 4 }] }), /companiesBroken/],
    ];
    for (const [label, input, message] of cases) {
      it(`rejects ${label}`, () => {
        expect(() => loadCampaign(input, ashAndBanner)).toThrow(CampaignSaveError);
        expect(() => loadCampaign(input, ashAndBanner)).toThrow(message);
      });
    }
  });

  it("normalizes JSON -0 to 0", () => {
    const good = afterTutorial();
    const json = saveCampaign(good).replace('"reformed":0', '"reformed":-0');
    expect(json).toContain("-0");
    const loaded = loadCampaign(json, ashAndBanner);
    expect(Object.is(loaded.companies[0].reformed, 0)).toBe(true);
    expect(loaded).toEqual(good);
  });

  it("drops unknown keys and cannot be used for prototype pollution", () => {
    const good = afterTutorial();
    const json = `{"version":1,"campaign":${JSON.stringify({ ...good, cheat: true }).slice(0, -1)},"__proto__":{"polluted":true}}}`;
    const loaded = loadCampaign(json, ashAndBanner);
    expect(loaded).toEqual(good);
    expect(Object.keys(loaded)).toEqual(["campaignId", "battleIndex", "status", "companies", "history"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses to write an oversized save", () => {
    const huge = { ...startCampaign(ashAndBanner), campaignId: "x".repeat(MAX_SAVE_BYTES) };
    expect(() => saveCampaign(huge)).toThrow(CampaignSaveError);
  });
});
